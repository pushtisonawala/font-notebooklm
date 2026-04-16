const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const { Readable } = require('stream');
const path = require('path');
const pdfParse = require('pdf-parse');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || '')
  .split(',')
  .map(model => model.trim())
  .filter(Boolean);
const GEMINI_MAX_RETRIES = Math.max(0, Number.parseInt(process.env.GEMINI_MAX_RETRIES || '2', 10) || 0);
const GEMINI_RETRY_DELAY_MS = Math.max(250, Number.parseInt(process.env.GEMINI_RETRY_DELAY_MS || '1500', 10) || 1500);
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const app = express();
const PORT = process.env.PORT || 8000;

let gfsBucket;

const getGeminiApiKey = () => process.env.GEMINI_API_KEY?.trim();

const getGeminiModelList = () => [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS])];

const getGeminiApiUrl = (model) => `${GEMINI_API_BASE_URL}/${model}:generateContent`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableGeminiError = (err) => {
  const upstreamStatus = err?.response?.status;
  const upstreamErrorStatus = err?.response?.data?.error?.status;

  return upstreamStatus === 429 || upstreamStatus === 503 || upstreamErrorStatus === 'RESOURCE_EXHAUSTED' || upstreamErrorStatus === 'UNAVAILABLE';
};

const requestGemini = async (contents) => {
  const models = getGeminiModelList();
  const triedModels = [];
  let lastError;

  for (const model of models) {
    triedModels.push(model);

    for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES + 1; attempt += 1) {
      try {
        const response = await axios.post(
          getGeminiApiUrl(model),
          { contents },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': getGeminiApiKey()
            },
            timeout: 30000,
          }
        );

        return { response, model, triedModels };
      } catch (err) {
        lastError = err;
        const retryable = isRetryableGeminiError(err);
        const canRetrySameModel = retryable && attempt <= GEMINI_MAX_RETRIES;

        console.warn(`Gemini request failed for model ${model} (attempt ${attempt}/${GEMINI_MAX_RETRIES + 1})`, {
          status: err?.response?.status,
          errorStatus: err?.response?.data?.error?.status,
          message: err?.response?.data?.error?.message || err.message,
        });

        if (canRetrySameModel) {
          await sleep(GEMINI_RETRY_DELAY_MS * attempt);
          continue;
        }

        if (!retryable) {
          err.triedModels = triedModels;
          throw err;
        }

        break;
      }
    }
  }

  if (lastError) {
    lastError.triedModels = triedModels;
    throw lastError;
  }

  throw new Error('Gemini request failed before any model could be tried.');
};

const getGeminiConfigError = () => {
  const geminiApiKey = getGeminiApiKey();

  if (!geminiApiKey) {
    return `Missing GEMINI_API_KEY in ${path.join(__dirname, '.env')}. Add a valid Gemini API key and restart the server.`;
  }

  return null;
};

const formatGeminiError = (err) => {
  const upstreamStatus = err?.response?.status;
  const upstreamError = err?.response?.data?.error;
  const upstreamMessage = upstreamError?.message || err.message || 'Unknown Gemini API error';
  const triedModels = Array.isArray(err?.triedModels) ? err.triedModels : [];
  const leakedKeyDetected =
    upstreamStatus === 403 &&
    typeof upstreamMessage === 'string' &&
    upstreamMessage.toLowerCase().includes('reported as leaked');

  if (leakedKeyDetected) {
    return {
      status: 503,
      error: 'Gemini API key was rejected by Google because it was reported as leaked.',
      details: `Generate a new Gemini API key, update ${path.join(__dirname, '.env')}, and restart the backend server.`,
      upstreamStatus,
    };
  }

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      status: 503,
      error: 'Gemini API request was rejected.',
      details: 'Check that GEMINI_API_KEY is valid, active, and allowed to access the selected Gemini model.',
      upstreamStatus,
    };
  }

  if (upstreamStatus === 429 || upstreamStatus === 503) {
    const modelsLabel = triedModels.length > 0 ? triedModels.join(', ') : GEMINI_MODEL;

    return {
      status: 503,
      error: 'Gemini is temporarily overloaded.',
      details: `The server retried the request${triedModels.length > 1 ? ' and tried fallback models' : ''}, but Gemini is still unavailable. Models tried: ${modelsLabel}. Please try again in a minute, or set GEMINI_FALLBACK_MODELS in ${path.join(__dirname, '.env')} to alternate models.`,
      upstreamStatus,
    };
  }

  return {
    status: 502,
    error: 'Gemini API error',
    details: upstreamMessage,
    upstreamStatus,
  };
};

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected Successfully to Cluster0');
    console.log('📊 Database:', mongoose.connection.db.databaseName);
    
    // Initialize GridFS
    gfsBucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'uploads'
    });
    console.log('📦 GridFS initialized for file storage');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

// Note Schema
const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    default: 'Untitled Note'
  },
  userId: {
    type: String,
    required: true,
  },
  files: [{
    fileId: mongoose.Schema.Types.ObjectId, // GridFS file ID
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    extractedText: String, // Extracted content from the file
  }],
  sources: [{
    type: String,
    url: String,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const Note = mongoose.model('Note', noteSchema);

// Chat Message Schema
const chatMessageSchema = new mongoose.Schema({
  noteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Note',
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

// Helper function to extract text from files
async function extractTextFromFile(buffer, mimetype, filename) {
  try {
    if (mimetype === 'application/pdf' || filename.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      return data.text;
    } else if (mimetype === 'text/plain' || filename.endsWith('.txt') || filename.endsWith('.md')) {
      return buffer.toString('utf-8');
    }
    return '';
  } catch (error) {
    console.error(`Error extracting text from ${filename}:`, error.message);
    return '';
  }
}

// Use memory storage for multer (files will be stored in MongoDB)
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Accept PDFs, text files, markdown, and audio files
    const allowedTypes = /pdf|txt|md|markdown|mp3|wav|m4a/;
    const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype || extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, TXT, Markdown, and Audio files are allowed'));
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 NotebookLM API Server Running',
    status: 'OK',
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    database: mongoose.connection.db?.databaseName
  });
});

// Get all notes
app.get('/api/v1/notes', async (req, res) => {
  try {
    const { page = 1, search = '' } = req.query;
    const limit = 10;
    const skip = (page - 1) * limit;

    const query = search ? { title: { $regex: search, $options: 'i' } } : {};
    
    const notes = await Note.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Note.countDocuments(query);

    res.json({
      notes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create note with file uploads (stored in MongoDB GridFS)
app.post('/api/v1/notes', upload.array('files', 10), async (req, res) => {
  try {
    const { userId, title } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const uploadedFiles = [];

    // Upload files to GridFS and extract text
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        // Extract text from file
        const extractedText = await extractTextFromFile(file.buffer, file.mimetype, file.originalname);
        console.log(`📝 Extracted ${extractedText.length} characters from ${file.originalname}`);

        const readableStream = Readable.from(file.buffer);
        const uploadStream = gfsBucket.openUploadStream(file.originalname, {
          metadata: {
            originalName: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            uploadDate: new Date()
          }
        });

        // Upload file to GridFS
        await new Promise((resolve, reject) => {
          readableStream.pipe(uploadStream)
            .on('error', reject)
            .on('finish', resolve);
        });

        uploadedFiles.push({
          fileId: uploadStream.id,
          filename: uploadStream.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          extractedText: extractedText
        });

        console.log(`📄 File uploaded to MongoDB: ${file.originalname} (ID: ${uploadStream.id})`);
      }
    }

    const note = new Note({
      title: title || 'Untitled Note',
      userId,
      files: uploadedFiles
    });

    await note.save();

    res.status(201).json({
      message: 'Note created successfully',
      note,
      filesUploaded: uploadedFiles.length
    });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle Google Drive files
app.post('/api/v1/notes/drive-files', async (req, res) => {
  try {
    const { fileId, userId, noteId } = req.body;
    
    // Here you would implement Google Drive file handling
    // For now, just acknowledge the request
    
    res.json({
      message: 'Drive file processing initiated',
      fileId,
      userId,
      noteId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single note
app.get('/api/v1/notes/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update note
app.put('/api/v1/notes/:id', async (req, res) => {
  try {
    const note = await Note.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete note and associated files from GridFS
app.delete('/api/v1/notes/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Delete associated files from GridFS
    if (note.files && note.files.length > 0) {
      for (const file of note.files) {
        try {
          await gfsBucket.delete(file.fileId);
          console.log(`🗑️ Deleted file from GridFS: ${file.originalName}`);
        } catch (err) {
          console.error(`Error deleting file ${file.originalName}:`, err.message);
        }
      }
    }

    await Note.findByIdAndDelete(req.params.id);
    res.json({ message: 'Note and files deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download file from GridFS
app.get('/api/v1/files/:fileId', async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    
    // Find file metadata
    const files = await gfsBucket.find({ _id: fileId }).toArray();
    
    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];
    
    // Set headers
    res.set('Content-Type', file.metadata?.mimetype || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${file.filename}"`);
    
    // Stream file from GridFS
    const downloadStream = gfsBucket.openDownloadStream(fileId);
    downloadStream.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chat endpoint - Ask questions based on note sources
app.post('/api/v1/chat/:noteId', async (req, res) => {
  try {
    const { noteId } = req.params;
    const { message, userId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Get the note with all sources
    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Combine all extracted text from sources
    const sourcesContext = note.files
      .map((file, index) => `Source ${index + 1} (${file.originalName}):\n${file.extractedText || ''}`)
      .join('\n\n---\n\n');

    if (!sourcesContext.trim()) {
      return res.status(400).json({ 
        error: 'No content extracted from sources. Please upload PDF or text files.' 
      });
    }

    console.log(`💬 Chat request for note ${noteId}: "${message.substring(0, 50)}..."`);

    // Get chat history for context
    const chatHistory = await ChatMessage.find({ noteId })
      .sort({ createdAt: 1 })
      .limit(10);


    // Prepare prompt for Gemini (multi-turn conversation)
    const contents = [];
    // System prompt as first user message
    contents.push({
      role: 'user',
      parts: [{ text: `You are a helpful AI assistant. Answer questions based ONLY on the following source documents. If the answer cannot be found in the sources, say so clearly.\n\nSOURCES:\n${sourcesContext}\n\nRemember: Base your answers strictly on the provided sources. Cite which source you're referencing when possible.` }]
    });
    // Add chat history
    chatHistory.forEach(msg => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    });
    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // Call Gemini API
    let assistantMessage = '';
    try {
      const geminiConfigError = getGeminiConfigError();
      if (geminiConfigError) {
        return res.status(503).json({ error: 'Gemini is not configured', details: geminiConfigError });
      }

      const { response: geminiRes, model: modelUsed } = await requestGemini(contents);
      assistantMessage = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';
      console.log(`Gemini response generated with model ${modelUsed}`);
    } catch (err) {
      const formattedError = formatGeminiError(err);
      console.error('Gemini API error:', {
        status: err?.response?.status,
        data: err?.response?.data || err.message,
      });
      return res.status(formattedError.status).json(formattedError);
    }

    // Save messages to database
    await ChatMessage.create({
      noteId,
      userId: userId || note.userId,
      role: 'user',
      content: message
    });

    await ChatMessage.create({
      noteId,
      userId: userId || note.userId,
      role: 'assistant',
      content: assistantMessage
    });

    res.json({
      success: true,
      message: assistantMessage,
      sourcesUsed: note.files.length
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get chat history for a note
app.get('/api/v1/chat/:noteId', async (req, res) => {
  try {
    const { noteId } = req.params;
    
    const messages = await ChatMessage.find({ noteId })
      .sort({ createdAt: 1 });

    res.json({
      messages,
      count: messages.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Database health check
app.get('/api/v1/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  res.json({
    status: dbState === 1 ? 'healthy' : 'unhealthy',
    database: {
      state: states[dbState],
      name: mongoose.connection.db?.databaseName,
      host: mongoose.connection.host
    },
    timestamp: new Date().toISOString()
  });
});

// Connect to DB and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 API endpoints available at http://localhost:${PORT}/api/v1`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/v1/health`);
  });
});

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('👋 MongoDB connection closed');
  process.exit(0);
});
