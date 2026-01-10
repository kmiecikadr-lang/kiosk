require('dotenv').config();
const express = require('express');
const fs = require('fs');
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
