import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// 確保基礎 DRAWING 目錄存在
const baseDrawingDir = path.join(__dirname, 'public', 'DRAWING');
if (!fs.existsSync(baseDrawingDir)) fs.mkdirSync(baseDrawingDir, { recursive: true });

// 1. 👉 取得動態選單清單：加入分類讀取
app.get('/api/drawings', (req, res) => {
  try {
    const items = fs.readdirSync(baseDrawingDir, { withFileTypes: true });
    const folders = items.filter(item => item.isDirectory()).map(item => {
      const id = item.name; let label = id; 
      let category = '未分類'; // ✨ 預設分類
      
      const dataFile = path.join(baseDrawingDir, id, 'data.json');
      if (fs.existsSync(dataFile)) {
        try { 
          const data = JSON.parse(fs.readFileSync(dataFile, 'utf8')); 
          if (data._meta && data._meta.name) label = data._meta.name; 
          if (data._meta && data._meta.category) category = data._meta.category; // ✨ 讀取分類
        } catch(e) {}
      }
      return { value: id, label: label, category: category }; // ✨ 回傳加上 category
    });
    res.json(folders);
  } catch (error) { res.status(500).json([]); }
});

// 2. 👉 取得單一圖紙的 Tag 資料庫
// 2. 👉 智慧掃描版：取得單一圖紙的 Tag 資料庫與自動掛載 SVG
app.get('/api/data/:drawingId', (req, res) => {
  const drawingId = req.params.drawingId;
  const folderPath = path.join(baseDrawingDir, drawingId);
  const dataFile = path.join(folderPath, 'data.json');
  
  let currentData = {};
  
  // 1. 先讀取已經建檔的資料 (文字、邏輯、標註)
  if (fs.existsSync(dataFile)) {
    try { currentData = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch(e) {}
  }
  
  // 2. 自動掃描實體資料夾，把所有丟進去的 .svg 自動掛載起來！
  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath);
    files.forEach(file => {
      // 排除掉主圖紙本身 (例如 DR0003.svg)
      if (file.toLowerCase().endsWith('.svg') && file !== `${drawingId}.svg`) {
        // 去掉附檔名，剩下的就是 TAG 名稱 (例如 PT-001)
        const blockId = file.substring(0, file.lastIndexOf('.'));
        
        // 如果這個 TAG 是全新的，幫它建一個空殼
        if (!currentData[blockId]) {
          currentData[blockId] = {};
        }
        
        // 自動把這張圖檔掛載給它
        currentData[blockId].svgFile = file;
      }
    });
  }
  
  res.json(currentData);
});

// 3. 👉 新增全新主圖紙的專用上傳設定
const mainStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destFolder = path.join(baseDrawingDir, req.body.drawingId);
    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
    cb(null, destFolder);
  },
  filename: (req, file, cb) => {
    cb(null, `${req.body.drawingId}.svg`); // 強制把主圖命名為 代號.svg
  }
});
const uploadMain = multer({ storage: mainStorage });

// 3. 👉 新增全新主圖紙：儲存分類
app.post('/api/upload-main', multer({ storage: mainStorage }).single('file'), (req, res) => {
  const { drawingId, drawingName, category } = req.body; // ✨ 接收分類
  if (!req.file || !drawingId) return res.status(400).json({ success: false });
  const dataFile = path.join(baseDrawingDir, drawingId, 'data.json');
  
  // ✨ 寫入 metadata 時包含 category
  let currentData = { _meta: { name: drawingName || drawingId, category: category || '未分類' } };
  if (fs.existsSync(dataFile)) { try { currentData = { ...JSON.parse(fs.readFileSync(dataFile, 'utf8')), ...currentData }; } catch(e){} }
  fs.writeFileSync(dataFile, JSON.stringify(currentData, null, 2), 'utf8');
  res.json({ success: true });
});

// 4. 👉 Tag 詳細圖面上傳設定
const detailStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(baseDrawingDir, req.body.drawingId));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.svg';
    cb(null, `${req.body.blockId}${ext}`);
  }
});
const uploadDetail = multer({ storage: detailStorage });

app.post('/api/upload', uploadDetail.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false });

  const { drawingId, blockId } = req.body;
  const filename = req.file.filename;

  const dataFile = path.join(baseDrawingDir, drawingId, 'data.json');
  let currentData = {};
  if (fs.existsSync(dataFile)) {
    try { currentData = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch(e) {}
  }

  if (!currentData[blockId]) currentData[blockId] = { type: '自訂上傳', logic: '' };
  currentData[blockId].svgFile = filename;
  
  fs.writeFileSync(dataFile, JSON.stringify(currentData, null, 2), 'utf8');
  res.json({ success: true, filename: filename });
});

// 5. 👉 刪除圖紙 (包含整個資料夾與所有上傳的圖)
app.delete('/api/drawings/:id', (req, res) => {
  const targetDir = path.join(baseDrawingDir, req.params.id);
  if (fs.existsSync(targetDir)) {
    // 遞迴刪除整個資料夾 (Node.js 14+ 支援 rmSync)
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  res.json({ success: true });
});

// 6. 👉 修改圖紙的顯示名稱與分類
app.put('/api/drawings/:id', (req, res) => {
  const { name, category } = req.body; // ✨ 接收新分類
  const dataFile = path.join(baseDrawingDir, req.params.id, 'data.json');
  
  let currentData = { _meta: { name: name || req.params.id, category: category || '未分類' } };
  if (fs.existsSync(dataFile)) {
    try { 
      currentData = { ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) }; 
      if (!currentData._meta) currentData._meta = {}; 
      currentData._meta.name = name;
      currentData._meta.category = category || '未分類'; // ✨ 更新分類
    } catch(e) {}
  } else {
    if (!fs.existsSync(path.dirname(dataFile))) fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  }
  fs.writeFileSync(dataFile, JSON.stringify(currentData, null, 2), 'utf8');
  res.json({ success: true });
});

// 7. 👉 更新單一 Tag 的文字資料 (類型與詳細邏輯)
// 7. 👉 更新單一 Tag 的文字資料 (類型與詳細邏輯與標註)
app.put('/api/data/:drawingId/:blockId', (req, res) => {
  const { drawingId, blockId } = req.params;
  
  // ✨ 1. 這裡補上接取 annotations
  const { type, logic, annotations } = req.body;

  const dataFile = path.join(baseDrawingDir, drawingId, 'data.json');
  let currentData = {};

  // 讀取目前的資料庫
  if (fs.existsSync(dataFile)) {
    try { currentData = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch(e) {}
  } else {
    // 如果資料夾不存在就先建出來
    if (!fs.existsSync(path.dirname(dataFile))) {
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    }
  }

  // 確保該 Tag 的節點存在
  if (!currentData[blockId]) currentData[blockId] = {};

  // 更新文字內容
  if (type !== undefined) currentData[blockId].type = type;
  if (logic !== undefined) currentData[blockId].logic = logic;
  
  // ✨ 2. 這裡補上將標註資料存入
  if (annotations !== undefined) currentData[blockId].annotations = annotations;

  // 存檔
  fs.writeFileSync(dataFile, JSON.stringify(currentData, null, 2), 'utf8');
  res.json({ success: true });
});

// 8. 👉 刪除單一 Tag 的實體圖片與連結
app.delete('/api/image/:drawingId/:blockId', (req, res) => {
  const { drawingId, blockId } = req.params;
  const dataFile = path.join(baseDrawingDir, drawingId, 'data.json');
  
  if (fs.existsSync(dataFile)) {
    try {
      const currentData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      
      // 檢查這個 Tag 是否有存圖片
      if (currentData[blockId] && currentData[blockId].svgFile) {
        const imagePath = path.join(baseDrawingDir, drawingId, currentData[blockId].svgFile);
        
        // 刪除硬碟中的實體檔案
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
        
        // 清空 JSON 裡的檔案紀錄
        currentData[blockId].svgFile = null;
        fs.writeFileSync(dataFile, JSON.stringify(currentData, null, 2), 'utf8');
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false });
    }
  } else {
    res.json({ success: true });
  }
});

app.listen(3000, () => {
  console.log('✅ 後端伺服器已啟動 (具備自動掃描與新增主圖功能)：http://localhost:3000');
});