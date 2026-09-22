// Isolated UI preview: no database connection and no access to workspace secrets.
const express = require('express');
const path = require('path');
const app = express();
const root = path.resolve(__dirname, '..');
app.get('/', (_, res) => res.redirect('/power-preview.html'));
app.get('/power-preview.html', (_, res) => res.sendFile(path.join(root, 'power-preview.html')));
app.get('/power-comparison.html', (_, res) => res.sendFile(path.join(root, 'power-comparison.html')));
app.use('/public/assets', express.static(path.join(root, 'public/assets')));
app.listen(4318, '127.0.0.1', () => console.log('National power preview: http://127.0.0.1:4318/power-preview.html'));
