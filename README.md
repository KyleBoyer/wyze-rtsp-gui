# wyze-rtsp-gui

This project is designed to be run against Wyze Cam Pan, running [EliasKotlyar/Xiaomi-Dafang-Hacks](https://github.com/EliasKotlyar/Xiaomi-Dafang-Hacks). It also assumes that you have ffmpeg installed for converting the RTSP to MJPEG. Converting to MJPEG allows for native/easy playing on almost any browser through the help of [phoboslab/jsmpeg](https://github.com/phoboslab/jsmpeg). Most of this conversion to websocket handling was completed via [kyriesent/node-rtsp-stream](https://github.com/kyriesent/node-rtsp-stream), however this project is currently using my fork of it, which allows passing *raw* `ws` options, which enables the websocket to run on the same port/server as this project's `http` or `https` server.

## Config

This project reads a JSON config file that resides in the same directory as the main script(`__dirname`). The available options are detailed below:

| Config Name | Default | Description |
| ----------- | :-----: | ----------- |
| `fbClientID` | `null` | Facebook Developer Application Client/Application ID |
| `fbClientSecret` | `null` | Facebook Developer Application Secret/Token |
| `anonymousControl` | `false` | To enable anyone to control this device, regardless of login status |
| `cameraCredentials` | `"root:ismart12"` | Default credentials used by [EliasKotlyar/Xiaomi-Dafang-Hacks](https://github.com/EliasKotlyar/Xiaomi-Dafang-Hacks) for controlling the device |
| `cameraIPorHost` | `"DAFANG"` | Default hostname set by [EliasKotlyar/Xiaomi-Dafang-Hacks](https://github.com/EliasKotlyar/Xiaomi-Dafang-Hacks) used for fetching the RTSP stream and calling controlling commands |
| `cameraPort` | `8554` | RTSP port to connect to |
| `serverPort` | `80` | What port to run this Node.JS server on for accepting connections to view/control the camera |
| `key` | `null` | Private key used for securing the server with SSL |
| `cert` | `null` | Public key used for securing the server with SSL |
| `ca` | `null` | (Optional) CA Certificates/Chain file used for securing the server with SSL |

### Comments

 - At the time of writing this, Facebook would **not** allow anyone to use the OAuth API to login without SSL.
 - If you aren't sure where to get these certificates, an good starting place is [LetsEncrypt](https://letsencrypt.org/).