var fs = require('fs');
const config = Object.assign({
  fbClientID: null,
  fbClientSecret: null,
  anonymousControl: false,
  cameraCredentials: 'root:ismart12',
  cameraIPorHost: 'DAFANG',
  cameraPort: 8554,
  serverPort: 80,
  sessionSecret: [...Array(128)].map(i => (~~(Math.random() * 36)).toString(36)).join(''),
  key: null,
  cert: null,
  ca: null
}, fs.existsSync(__dirname + "/config.json") ? JSON.parse(fs.readFileSync(__dirname + "/config.json").toString()) : {});
const useSSL = (!!config.key && fs.existsSync(config.key) && !!config.cert && fs.existsSync(config.cert));
const Stream = require('node-rtsp-stream');
var net = require('net');
var http = require('http');
var https = require('https');
const express = require('express');
const session = require("express-session");
var FileStore = require('session-file-store')(session);
const bodyParser = require("body-parser");
const request = require('request');
const getPort = require('get-port');
const usersConfigFile = `${__dirname}/users.json`;
var userList;

function setLoadAndSetUserList() {
  userList = fs.existsSync(usersConfigFile) ? JSON.parse(fs.readFileSync(usersConfigFile).toString()) : {};
}
setLoadAndSetUserList();
const chokidar = require('chokidar');
chokidar.watch(usersConfigFile).on('all', () => {
  console.log("Reloading users config file...");
  setLoadAndSetUserList();
});
var app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(session({
  secret: config.sessionSecret,
  cookie: {
    secure: useSSL,
    httpOnly: !useSSL
  },
  resave: false,
  saveUninitialized: false,
  store: new FileStore({
    path: `${__dirname}/sessions`,
    secret: config.sessionSecret
  })
}));
app.use(express.static(__dirname + '/webroot'));
const fbCallback = '/callback';

function getCallbackURL(req) {
  return `${req.protocol}://${req.get('host')}${fbCallback}`;
}

function tranformBasicCredentials(creds) {
  if (creds.includes(':')) {
    return Buffer.from(creds).toString('base64');
  } else {
    return creds;
  }
}
app.get('/login', function (req, res) {
  if (config.fbClientID && config.fbClientSecret) {
    res.redirect(`https://www.facebook.com/v5.0/dialog/oauth?scope=email&client_id=${config.fbClientID}&redirect_uri=${getCallbackURL(req)}`);
  } else {
    res.redirect('/');
  }
});
app.get('/logout', function (req, res) {
  req.session.destroy(function () {
    res.redirect('/');
  });
});
function saveUserList(){
  fs.writeFileSync(usersConfigFile, JSON.stringify(userList, null, "\t"));
}
app.get(fbCallback, function (req, res) {
  if (req && req.query && req.query.code && config.fbClientID && config.fbClientSecret) {
    request.get(`https://graph.facebook.com/v5.0/oauth/access_token?client_id=${config.fbClientID}&redirect_uri=${getCallbackURL(req)}&client_secret=${config.fbClientSecret}&code=${req.query.code}`, {
      json: true
    }, function (err, _, body) {
      if (err) {
        return res.redirect('/');
      }
      if (body && body.access_token) {
        request.get(`https://graph.facebook.com/me?fields=email&access_token=${body.access_token}`, {
          json: true
        }, function (err, _, profile) {
          if (err) {
            return res.redirect('/');
          }
          if (profile && profile.email) {
            if (!Object.keys(userList).includes(profile.email)) {
              userList[profile.email] = {
                canControl: false,
                canAdmin: false
              };
              saveUserList();
            }
            req.session.email = profile.email;
            req.session.save(function () {
              return res.redirect('/');
            });
          } else {
            return res.redirect('/');
          }
        });
      } else {
        return res.redirect('/');
      }
    });
  } else {
    return res.redirect('/');
  }
});

function makeIPCameraGETRequest(url) {
  return request.get(url, {
    rejectUnauthorized: false,
    headers: {
      "Authorization": `Basic ${tranformBasicCredentials(config.cameraCredentials)}`
    }
  });
}

function isControlAllowed(req) {
  return (config.anonymousControl || (req && req.session && req.session.email && userList[req.session.email] && userList[req.session.email].canControl));
}

function isAdminAllowed(req) {
  return (isControlAllowed(req) && req && req.session && req.session.email && userList[req.session.email] && userList[req.session.email].canAdmin);
}
app.get('/calibrate', function (req, res) {
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=motor_calibrate`);
  }
  res.redirect('/');
});
app.get('/left', function (req, res) {
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=motor_left&val=100`);
  }
  res.redirect('/');
});
app.get('/right', function (req, res) {
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=motor_right&val=100`);
  }
  res.redirect('/');
});
app.get('/up', function (req, res) {
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=motor_up&val=100`);
  }
  res.redirect('/');
});
app.get('/down', function (req, res) {
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=motor_down&val=100`);
  }
  res.redirect('/');
});

app.get('/nightmode', function (req, res) {
  var isOn = ((req && req.query && Object.keys(req.query).includes("on") && req.query.on != null) ? (req.query.on.toLowerCase() == 'true') : true);
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=toggle-rtsp-nightvision-${isOn ? 'on' : 'off'}`);
  }
  res.redirect('/');
});

app.get('/canadmin', function (req, res) {
  if (isAdminAllowed(req)) {
    var isOn = ((req && req.query && Object.keys(req.query).includes("on") && req.query.on != null) ? (req.query.on.toLowerCase() == 'true') : false);
    var email = ((req && req.query && Object.keys(req.query).includes("email") && req.query.email != null) ? req.query.email : null);
    if(email != null && Object.keys(userList).includes(email)){
      userList[email].canAdmin = isOn;
      saveUserList();
      return res.end();
    }
  }
  res.redirect('/');
});

app.get('/cancontrol', function (req, res) {
  if (isAdminAllowed(req)) {
    var isOn = ((req && req.query && Object.keys(req.query).includes("on") && req.query.on != null) ? (req.query.on.toLowerCase() == 'true') : false);
    var email = ((req && req.query && Object.keys(req.query).includes("email") && req.query.email != null) ? req.query.email : null);
    if(email != null && Object.keys(userList).includes(email)){
      userList[email].canControl = isOn;
      saveUserList();
      return res.end();
    }
  }
  res.redirect('/');
});

app.get('/usersettings', function (req, res) {
  if (isAdminAllowed(req)) {
    return res.json(userList);
  }
  res.redirect('/');
});

app.get('/image', function (req, res) {
  makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/currentpic.cgi`).pipe(res);
});

app.get('*', function (req, res) {
  res.render('index', {
    ssl: useSSL,
    anonymousControl: config.anonymousControl,
    loginEnabled: (!!config.fbClientID && !!config.fbClientSecret),
    user: req.session.email,
    canControl: isControlAllowed(req),
    canAdmin: isAdminAllowed(req),
    userList
  });
});

var mainServer;
(async () => {
  var redirectAddress = await getPort();
  var httpsAddress = await getPort();
  if (useSSL) {
    http.createServer((req, res) => {
      var host = req.headers['host'];
      res.writeHead(301, {
        "Location": "https://" + host + req.url
      });
      res.end();
    }).listen(redirectAddress);
    var privateKey = fs.readFileSync(config.key, 'utf8');
    var certificate = fs.readFileSync(config.cert, 'utf8');
    var serverOpts = {
      "key": privateKey,
      "cert": certificate
    };
    if (!!config.ca && fs.existsSync(config.ca)) {
      var chainLines = fs.readFileSync(config.ca, 'utf8').split("\n");
      var cert = [];
      var ca = [];
      chainLines.forEach(function (line) {
        cert.push(line);
        if (line.match(/-END CERTIFICATE-/)) {
          ca.push(cert.join("\n"));
          cert = [];
        }
      });
      serverOpts["ca"] = ca;
    }
    mainServer = https.createServer(serverOpts, app);
    mainServer.listen(httpsAddress);
    net.createServer(function (conn) {
      conn.on('error', function (err) {
        if (err.code !== 'ECONNRESET') {
          throw err;
        }
      });
      conn.once('data', function (buf) {
        // A TLS handshake record starts with byte 22.
        var address = (buf[0] === 22) ? httpsAddress : redirectAddress;
        var proxy = net.createConnection(address, function () {
          proxy.write(buf);
          conn.pipe(proxy).pipe(conn);
        });
      });
    }).listen(config.serverPort, () => console.info(`Server running on port: ${config.serverPort}`));
  } else {
    mainServer = http.createServer(app);
    mainServer.listen(config.serverPort, () => console.info(`Server running on port: ${config.serverPort}`));
  }
  const stream = new Stream({
    name: 'name',
    streamUrl: `rtsp://${config.cameraIPorHost}:${config.cameraPort}/unicast`,
    wsOptions: {
      server: mainServer,
      path: "/ws"
    },
    ffmpegOptions: { // options ffmpeg flags
      '-stats': '', // an option with no neccessary value uses a blank string
      '-r': 30 // options with required values specify the value after the key
    },
    reconnect: true,
    reconnectTimeout: 1000
  });
  var streamStopped = false;

  function exitHandler() {
    if (!streamStopped) {
      streamStopped = true;
      console.log("Stopping stream...");
      stream.stop();
    }
    setImmediate(function () {
      process.exit();
    });
  }
  process.on('close', exitHandler);
  process.on('SIGINT', exitHandler);
  process.on('SIGTERM', exitHandler);
  process.on('SIGUSR1', exitHandler);
  process.on('SIGUSR2', exitHandler);
})();