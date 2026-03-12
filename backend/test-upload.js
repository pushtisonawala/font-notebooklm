const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testFileUpload() {
  console.log('🧪 Testing PDF upload to MongoDB GridFS...\n');

  // Create a simple test PDF content
  const testContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF File) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000315 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
407
%%EOF`;

  // Write test file
  fs.writeFileSync('test-upload.pdf', testContent);
  
  try {
    // Create form data
    const formData = new FormData();
    formData.append('files', fs.createReadStream('test-upload.pdf'));
    formData.append('userId', 'test-user-123');
    formData.append('title', 'Test Note with PDF');

    // Upload to server
    console.log('📤 Uploading test PDF to server...');
    const response = await fetch('http://localhost:8000/api/v1/notes', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Upload successful!');
      console.log('📝 Note ID:', result.note._id);
      console.log('📄 Files uploaded:', result.filesUploaded);
      console.log('🆔 GridFS File ID:', result.note.files[0]?.fileId);
      console.log('\n💾 File is now stored in MongoDB GridFS!');
      
      // Clean up test file
      fs.unlinkSync('test-upload.pdf');
      
      return result.note._id;
    } else {
      console.error('❌ Upload failed:', result);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testFileUpload();
