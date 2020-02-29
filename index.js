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
var cookieSession = require('cookie-session')
const bodyParser = require("body-parser");
const request = require('request');
const {
  JSDOM
} = require("jsdom");
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
app.set('trust proxy', 1);
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(cookieSession({
  name: '.wyzegui',
  secret: config.sessionSecret,
  httpOnly: false,
  secure: useSSL
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
  req.session = null
  res.redirect('/');
});

function saveUserList() {
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
            req.session.save();
            return res.redirect('/');
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

function makeIPCameraRequest(url, method, form, cb) {
  return request({
    url,
    method,
    form,
    rejectUnauthorized: false,
    headers: {
      "Authorization": `Basic ${tranformBasicCredentials(config.cameraCredentials)}`
    }
  }, cb);
}

function makeIPCameraGETRequest(url, cb) {
  return makeIPCameraRequest(url, 'GET', null, cb);
}

function makeIPCameraPOSTRequest(url, form, cb) {
  return makeIPCameraRequest(url, 'POST', form, cb);
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
    return res.status(200).end();
  }
  return res.status(401).end();
});
app.get('/left', function (req, res) {
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=motor_left&val=100`);
    return res.status(200).end();
  }
  return res.status(401).end();
});
app.get('/right', function (req, res) {
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=motor_right&val=100`);
    return res.status(200).end();
  }
  return res.status(401).end();
});
app.get('/up', function (req, res) {
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=motor_up&val=100`);
    return res.status(200).end();
  }
  return res.status(401).end();
});
app.get('/down', function (req, res) {
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=motor_down&val=100`);
    return res.status(200).end();
  }
  return res.status(401).end();
});

app.get('/nightmode', function (req, res) {
  var isOn = ((req && req.query && Object.keys(req.query).includes("on") && req.query.on != null) ? (req.query.on.toLowerCase() == 'true') : true);
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=toggle-rtsp-nightvision-${isOn ? 'on' : 'off'}`);
    return res.status(200).end();
  }
  return res.status(401).end();
});

app.get('/restart', function (req, res) {
  if (isControlAllowed(req)) {
    stream.stream.kill();
    return res.status(200).end();
  }
  return res.status(401).end();
});

function objectFromEntries(entries) {
  var obj = {};
  for (let [key, value] of entries) {
    obj[key] = value;
  }
  return obj;
}

function getOSDSettings(cb) {
  makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/system_osd.cgi`, function (err, _, body) {
    const dom = new JSDOM(body);
    const {
      document,
      FormData
    } = dom.window
    cb(objectFromEntries(new FormData(document.querySelector('form')).entries()));
  });
}
app.get('/date-label', function (req, res) {
  var isOn = ((req && req.query && Object.keys(req.query).includes("on") && req.query.on != null) ? (req.query.on.toLowerCase() == 'true') : true);
  if (isControlAllowed(req)) {
    return getOSDSettings(function (osd) {
      var newOsd = osd;
      newOsd['OSDenable'] = isOn ? 'enabled' : '';
      makeIPCameraPOSTRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=osd`, newOsd).pipe(res);
    });
  }
  return res.status(401).end();
});
app.get('/axis-label', function (req, res) {
  var isOn = ((req && req.query && Object.keys(req.query).includes("on") && req.query.on != null) ? (req.query.on.toLowerCase() == 'true') : true);
  if (isControlAllowed(req)) {
    return getOSDSettings(function (osd) {
      var newOsd = osd;
      newOsd['AXISenable'] = isOn ? 'enabled' : '';
      makeIPCameraPOSTRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=osd`, newOsd).pipe(res);
    });
  }
  return res.status(401).end();
});

app.get('/debug-label', function (req, res) {
  var isOn = ((req && req.query && Object.keys(req.query).includes("on") && req.query.on != null) ? (req.query.on.toLowerCase() == 'true') : true);
  if (isControlAllowed(req)) {
    makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=${isOn ? 'on' : 'off'}Debug`);
    return res.status(200).end();
  }
  return res.status(401).end();
});

app.get('/canadmin', function (req, res) {
  if (isAdminAllowed(req)) {
    var isOn = ((req && req.query && Object.keys(req.query).includes("on") && req.query.on != null) ? (req.query.on.toLowerCase() == 'true') : false);
    var email = ((req && req.query && Object.keys(req.query).includes("email") && req.query.email != null) ? req.query.email : null);
    if (email != null && Object.keys(userList).includes(email)) {
      userList[email].canAdmin = isOn;
      saveUserList();
      return res.status(200).end();
    }
  }
  return res.status(401).end();
});

app.get('/cancontrol', function (req, res) {
  if (isAdminAllowed(req)) {
    var isOn = ((req && req.query && Object.keys(req.query).includes("on") && req.query.on != null) ? (req.query.on.toLowerCase() == 'true') : false);
    var email = ((req && req.query && Object.keys(req.query).includes("email") && req.query.email != null) ? req.query.email : null);
    if (email != null && Object.keys(userList).includes(email)) {
      userList[email].canControl = isOn;
      saveUserList();
      return res.status(200).end();
    }
  }
  return res.status(401).end();
});

app.get('/usersettings', function (req, res) {
  if (isAdminAllowed(req)) {
    return res.json(userList);
  }
  return res.status(401).end();
});
function getImage(captionless,res){
  if(captionless){
    return getOSDSettings(function (osd) {
      var newOsd = JSON.parse(JSON.stringify(osd));
      newOsd['AXISenable'] = '';
      newOsd['OSDenable'] = '';
      makeIPCameraPOSTRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=osd`, newOsd, () => {
        setTimeout(() => {
          makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/currentpic.cgi`).pipe(res).on('finish', function () {
            makeIPCameraPOSTRequest(`https://${config.cameraIPorHost}/cgi-bin/action.cgi?cmd=osd`, osd);
          });
        }, 3000);
      });
    });
  }else{
    return makeIPCameraGETRequest(`https://${config.cameraIPorHost}/cgi-bin/currentpic.cgi`).pipe(res);
  }
}
app.get('/image', function (req, res) {
  var captionOn = ((req && req.query && Object.keys(req.query).includes("caption") && req.query.caption != null) ? (req.query.caption.toLowerCase() == 'true') : true);
  return getImage(!captionOn, res);
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
var stream;

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
  var ffmpegOptions = Object.assign({ // options ffmpeg flags
    '-stats': '', // an option with no neccessary value uses a blank string
    '-r': 30 // options with required values specify the value after the key
  }, (config.ffmpegOptions || {}));
  stream = new Stream({
    name: 'name',
    streamUrl: `rtsp://${config.cameraIPorHost}:${config.cameraPort}/unicast`,
    wsOptions: {
      server: mainServer,
      path: "/ws"
    },
    ffmpegOptions,
    reconnect: true,
    reconnectTimeout: 1000,
    reconnectInterval: (24 * 60 * 60 * 1000)
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