const { app, BrowserWindow, session } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' file: 'unsafe-inline' 'unsafe-eval'; " +
          "connect-src 'self' http://192.168.1.131:8080 ws://192.168.1.131:8080; " +
          "media-src 'self' http://192.168.1.131:8080 blob:;"
        ]
      }
    });
  });

  win.loadFile(path.join(__dirname, '../www/index.html'));

  win.webContents.openDevTools();

  // ✅ Dentro de createWindow, donde win sí existe
  win.on('close', (e) => {
    e.preventDefault();
    win.webContents.executeJavaScript(`
      const token = localStorage.getItem('token');
      if (token) {
        fetch('http://192.168.1.131:8080/api/auth/dispositivo/desconectar', {
          method: 'POST',
          headers: { 
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        });
      }
    `).then(() => setTimeout(() => win.destroy(), 400));
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});