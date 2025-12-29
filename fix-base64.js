require('dotenv').config();
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const sql = postgres(process.env.DATABASE_URL);

async function fixBase64Messages() {
  console.log('🔍 Finding base64 image messages...');
  
  const msgs = await sql`
    SELECT id, content, session_id 
    FROM messages 
    WHERE content LIKE '%data:image%'
  `;
  
  console.log(`Found ${msgs.length} messages with base64 images`);
  
  const uploadsDir = process.env.UPLOAD_DIR || './uploads';
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
  
  for (const msg of msgs) {
    console.log(`\n📝 Processing message ${msg.id}...`);
    
    // Extract base64 from markdown: ![...](data:image/png;base64,XXXXX)
    const base64Match = msg.content.match(/!\[([^\]]*)\]\(data:image\/[^;]+;base64,([^)]+)\)/);
    
    if (!base64Match) {
      console.log(`  ⚠️ No base64 pattern found, skipping`);
      continue;
    }
    
    const altText = base64Match[1] || 'Generated Image';
    const base64Data = base64Match[2];
    
    console.log(`  📊 Base64 size: ${(base64Data.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Save to file
    const fileName = `img_${randomUUID()}.png`;
    const filePath = path.join(uploadsDir, fileName);
    const imageBuffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, imageBuffer);
    
    // Create new content with URL
    const imageUrl = `${backendUrl}/uploads/${fileName}`;
    const newContent = `![${altText}](${imageUrl})`;
    
    // Update database
    await sql`UPDATE messages SET content = ${newContent} WHERE id = ${msg.id}`;
    
    console.log(`  ✅ Saved to ${fileName}, updated message`);
  }
  
  console.log('\n✅ All base64 messages converted to URLs!');
  await sql.end();
}

fixBase64Messages().catch(e => {
  console.error('Error:', e);
  sql.end();
  process.exit(1);
});
