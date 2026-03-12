# NotebookLM Implementation Guide

## Complete Workflow

### 📤 1. Upload Sources
- User uploads PDF, TXT, MD files
- Files stored in MongoDB GridFS ✅ DONE
- Files shown in Sources panel ✅ DONE

### 📖 2. Extract & Process Content
- Extract text from PDFs using `pdf-parse`
- Read text from .txt/.md files
- Store extracted content in database
- Status: **NEEDS IMPLEMENTATION**

### 💬 3. Chat with AI
- User asks questions in chat
- Backend retrieves relevant content from sources
- Sends context + question to OpenAI/Anthropic
- Returns AI response based on sources
- Status: **NEEDS IMPLEMENTATION**

## Required Packages

```bash
cd backend
npm install pdf-parse openai
```

## Environment Variables Needed

Add to `backend/.env`:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

## Implementation Steps

1. Install packages
2. Update Note schema to store extracted text
3. Create text extraction functions
4. Create chat endpoint
5. Update frontend to send chat messages
