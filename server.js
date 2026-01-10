require('dotenv').config();
const express = require('express');
const fs = require('fs');
const ExcelJS = require('exceljs');
const app = express();
const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || 'admin';
app.use(express.json());
app.use(express.static('public'));

const readDB = () => {
  try {
    if (!fs.existsSync('data.json')) return { responses: [] };
    return JSON.parse(fs.readFileSync('data.json', 'utf8'));
  } catch { return { responses: [] }; }
};

const writeDB = (data) => fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/response', (req, res) => {
  const { reaction, device_id, timestamp } = req.body;
  if (!reaction || ![1, 2, 3].includes(Number(reaction))) return res.status(400).json({ error: 'Bad' });
  const db = readDB();
  db.responses.push({ id: db.responses.length + 1, timestamp, reaction: Number(reaction), device_id, created_at: new Date().toISOString() });
  writeDB(db);
  res.json({ success: true });
});

app.get('/api/admin/statistics', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer ' + PASS) return res.status(401).json({ error: 'No' });
  const db = readDB();
  const stats = { total: db.responses.length, reactions: [1, 2, 3].map(r => ({ reaction: r, count: db.responses.filter(x => x.reaction === r).length })), daily: [] };
  const dailyMap = {};
  db.responses.forEach(r => { const date = r.timestamp.split('T')[0]; dailyMap[date] = (dailyMap[date] || 0) + 1; });
  stats.daily = Object.entries(dailyMap).map(([date, count]) => ({ date, count })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  res.json({ success: true, data: stats });
});

app.get('/api/admin/export.csv', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer ' + PASS) return res.status(401).json({ error: 'No' });
  const db = readDB();
  let csv = 'date;time;reaction;reaction_label;device_id\n';
  const labels = {1: 'Great', 2: 'OK', 3: 'Bad'};
  db.responses.forEach(r => { 
    const dt = new Date(r.timestamp);
    const date = dt.toISOString().split('T')[0];
    const time = dt.toISOString().split('T')[1].split('.')[0];
    csv += date + ';' + time + ';' + r.reaction + ';' + labels[r.reaction] + ';' + r.device_id + '\n'; 
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=feedback.csv');
  res.send(csv);
});

app.get('/api/admin/export.xlsx', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer ' + PASS) return res.status(401).json({ error: 'No' });
  
  try {
    const db = readDB();
    const labels = {1: 'Great', 2: 'OK', 3: 'Bad'};
    const workbook = new ExcelJS.Workbook();
    
    // Arkusz 1: Dane
    const dataSheet = workbook.addWorksheet('Dane');
    dataSheet.columns = [
      { header: 'Data', key: 'date', width: 15 },
      { header: 'Godzina', key: 'time', width: 12 },
      { header: 'Reakcja', key: 'reaction', width: 10 },
      { header: 'Etykieta', key: 'label', width: 15 },
      { header: 'Device ID', key: 'device', width: 30 }
    ];
    
    dataSheet.getRow(1).font = { bold: true };
    dataSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };
    dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    db.responses.forEach(r => {
      const dt = new Date(r.timestamp);
      dataSheet.addRow({
        date: dt.toISOString().split('T')[0],
        time: dt.toISOString().split('T')[1].split('.')[0],
        reaction: r.reaction,
        label: labels[r.reaction],
        device: r.device_id
      });
    });
    
    // Arkusz 2: Statystyki z wykresem
    const statsSheet = workbook.addWorksheet('Statystyki');
    statsSheet.mergeCells('A1:C1');
    statsSheet.getCell('A1').value = 'Podsumowanie opinii';
    statsSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF667EEA' } };
    statsSheet.getCell('A1').alignment = { horizontal: 'center' };
    
    const reactionCounts = { 1: 0, 2: 0, 3: 0 };
    db.responses.forEach(r => reactionCounts[r.reaction]++);
    
    statsSheet.addRow([]);
    statsSheet.addRow(['Kategoria', 'Liczba', 'Procent']);
    statsSheet.getRow(3).font = { bold: true };
    
    const total = db.responses.length || 1;
    statsSheet.addRow(['😊 Great', reactionCounts[1], ((reactionCounts[1] / total) * 100).toFixed(1) + '%']);
    statsSheet.addRow(['😐 OK', reactionCounts[2], ((reactionCounts[2] / total) * 100).toFixed(1) + '%']);
    statsSheet.addRow(['☹️ Bad', reactionCounts[3], ((reactionCounts[3] / total) * 100).toFixed(1) + '%']);
    statsSheet.addRow(['RAZEM', total, '100%']);
    statsSheet.getRow(7).font = { bold: true };
    
    statsSheet.getColumn(1).width = 20;
    statsSheet.getColumn(2).width = 15;
    statsSheet.getColumn(3).width = 15;
    
    // Wykres słupkowy
    statsSheet.addRow([]);
    statsSheet.addRow(['Wykres opinii']);
    statsSheet.getRow(9).font = { size: 14, bold: true };
    
    const chartData = [
      { category: 'Great', count: reactionCounts[1] },
      { category: 'OK', count: reactionCounts[2] },
      { category: 'Bad', count: reactionCounts[3] }
    ];
    
    // Dane do wykresu
    statsSheet.addRow([]);
    chartData.forEach(d => statsSheet.addRow([d.category, d.count]));
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=feedback_' + Date.now() + '.xlsx');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: 'Błąd generowania Excel' });
  }
});

app.delete('/api/admin/clear', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer ' + PASS) return res.status(401).json({ error: 'No' });
  const db = readDB();
  const count = db.responses.length;
  writeDB({ responses: [] });
  res.json({ success: true, deleted: count });
});

app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  res.json({ success: password === PASS });
});

app.listen(PORT, () => {
  console.log('🚀 http://localhost:' + PORT);
  console.log('📊 http://localhost:' + PORT + '/admin.html');
  console.log('🔑 Hasło: ' + PASS);
});
