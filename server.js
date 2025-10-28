const app = require('./app');
const PORT = process.env.PORT || 8000;

const server = app.listen(PORT, () => {
  console.log(`伺服器已啟動：http://localhost:${PORT}`);
  console.log(`✅ Allowed origin: ${process.env.CLIENT_ORIGIN}`);
});

server.on('error', (error) => {
  console.error('!!!!!!!!!! 伺服器發生致命錯誤 !!!!!!!!!!');
  if (error.code === 'EADDRINUSE') {
    console.error(`PORT ${PORT} 已被其他程式佔用。`);
  } else {
    console.error('錯誤詳細資訊:', error);
  }
  process.exit(1);
});
