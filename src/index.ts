import {
    XencelabsQuickKeys,
    XencelabsQuickKeysDisplayOrientation,
    XencelabsQuickKeysManagerInstance,
    XencelabsQuickKeysWheelSpeed
} from '@xencelabs-quick-keys/node'
import { exit } from 'process'

const path = require('path');
const fsPromises = require('node:fs/promises');

const input = require('./input')
const config = require('./config')
const commands = require('./commands')
const notification = require('./notification')

let conf: any;
let deviceFound = false;
let batteryLevel: number = -1;
let device: XencelabsQuickKeys;
let orientation: XencelabsQuickKeysDisplayOrientation;
let wheelSpeed: XencelabsQuickKeysWheelSpeed;

let currentKeys: number[] = []
let clearKeys: number[] = []

let shift: number = 0;
let shiftTime: number = 0;
let shiftTimeOut: number = 2000;
let keyTime: number = 0;

// --| Sleep for duration -----------------------
function sleep(time: number | undefined) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

// --| Check if device was found ----------------
async function checkDevice() {
    sleep(100)
    await sleep(100).then(async () => {
        if (!deviceFound) {
            console.log('No device found. Is it powered on?'); exit(0);
        }
    })
}

async function setDeviceSettings(customMsg: string = "") {
    await device.setSleepTimeout(conf.settings.sleep_timeout);

    // --| Set wheel speed ------------
    switch (conf.settings.wheel_step) {
        case 1: wheelSpeed = XencelabsQuickKeysWheelSpeed.Slowest; break;
        case 2: wheelSpeed = XencelabsQuickKeysWheelSpeed.Slower; break;
        case 3: wheelSpeed = XencelabsQuickKeysWheelSpeed.Normal; break;
        case 4: wheelSpeed = XencelabsQuickKeysWheelSpeed.Faster; break;
        case 5: wheelSpeed = XencelabsQuickKeysWheelSpeed.Fastest; break;
        default: break;
    }
    await device.setWheelSpeed(wheelSpeed);

    // --| Set device orientation -----
    switch (conf.settings.orientation) {
        case 0: orientation = XencelabsQuickKeysDisplayOrientation.Rotate0; break;
        case 90: orientation = XencelabsQuickKeysDisplayOrientation.Rotate90; break;
        case 180: orientation = XencelabsQuickKeysDisplayOrientation.Rotate180; break;
        case 270: orientation = XencelabsQuickKeysDisplayOrientation.Rotate270; break;
        default: break;
    }
    await device.setDisplayOrientation(orientation);

    // --| Set wheel color ------------
    let color = conf.wheel.color;
    let red = [255, 0, 0];
    let cst = [color[0], color[1], color[2]]

    let colors = [
        { color: red, duration: 0 },
        { color: cst, duration: 200 },
        { color: red, duration: 400 },
        { color: cst, duration: 600 },
        { color: red, duration: 800 },
        { color: cst, duration: 1000 },
    ];

    colors.forEach(async (c) => {
        await sleep(c.duration).then(async () => {
            await device.setWheelColor(c.color[0], c.color[1], c.color[2]);
        })
    });

    // --| Display welcome message ----
    let overlayText = (customMsg === "" ? conf.settings.welcome_text : customMsg);
    if (batteryLevel != -1) { overlayText = `${overlayText} - Battery: ${batteryLevel}%` }

    await device.showOverlayText(1, overlayText).then(async () => {
        // --| Set button text ------------
        try {
            for (let button in conf.buttons) {
                let num = Number.parseInt(button);
                if (num > 7) { break; }
                let keyText = conf.buttons[button].text;

                if (keyText.length > 8) {
                    keyText = keyText.substring(0, 8);
                    console.log(`Button ${button} text is too long, truncated to ${keyText}`);
                }

                await device.setKeyText(num, keyText)
            }
        } catch (error) { console.error(error); exit(1); };
    });;
}

// --| Device Connected Functionality ------
// --|--------------------------------------
XencelabsQuickKeysManagerInstance.on('connect', async (qkDevice) => {
    await qkDevice.startData();

    // --| Connected Notification ----------
    let notify_path = path.join(__dirname, "../", "scripts/notify-send.sh");
    let system_notify = `${notify_path} 'QuickKeys' 'QuickKeys Connected!'`;
    await commands.runCommand(system_notify);

    if (qkDevice === undefined) { console.log('Error locating device...'); exit(0); }
    conf = await config.readConfig();

    deviceFound = true;
    device = qkDevice;

    // --| Notification listener -----------
    // notification.setDevice(device);
    notification.startWatcher(conf.settings.notification_path, qkDevice);

    // Overwrite some defaults
    if ( typeof(conf.settings.shift_time_out) !== 'undefined' ) {
      shiftTimeOut = conf.settings.shift_time_out;
      console.log("CONF Set shiftTimeOut="+shiftTimeOut)
    }

    // --| Check battery status ------------
    qkDevice.on('battery', async (battery) => {
        batteryLevel = battery.valueOf();
        let msg: string = "";

        switch (batteryLevel) {
            case 90: msg = "Battery level is 90%"; break;
            case 75: msg = "Battery level is 75%"; break;
            case 50: msg = "Battery level is 50%"; break;
            case 25: msg = "Battery level is 25%"; break;
        }

        if (batteryLevel <= 10) {
            await device.showOverlayText(4, `Battery is low: ${batteryLevel}%`);
        }

        if (msg != "") {
            notification.handleNotification({ message: msg, duration: 4, device: qkDevice });
            console.log(`Current Battery: ${batteryLevel}`);
        }
    })

    // --| Perform button down action ------
    qkDevice.on('down', (keyIndex) => { 
	    keyTime = new Date().getTime()
	    currentKeys.push(keyIndex)
	    console.log(`Key down:${keyIndex} Chord:${currentKeys}`);
	    return;
    });

    // --| Perform button up action --------
    qkDevice.on('up', async (keyIndex) => {
	var delay = Math.floor((new Date().getTime() - keyTime)/1000)
	currentKeys = currentKeys.filter(x=> x != keyIndex);
	if (clearKeys.find(x=> x==keyIndex)) {
	  clearKeys = clearKeys.filter(x=> x!= keyIndex);
	  return;
	}
	console.log(`Key up:${keyIndex} Chord:${currentKeys}`);
        try {
	    // Check the Shift timeout before we rely on shift value
	    if ( ( shiftTime + shiftTimeOut ) < new Date().getTime() ) {
		    shift = 0
		    console.log("Shift reset")
	    }

	    // We will look for "command" or if there are other keys held... command_key_key...
	    // special suffix "_x" will cause keys to be cleared after use so a button
	    // can be used to chord *and* have a single press use.
	    var commID = currentKeys.length > 0 ? `command_${currentKeys.sort().join("_")}` : "command"
	    if ( shift > 0 ) {
	      var commID = commID + "_s" + shift
	    }
	    console.log("commID = " + commID + " Delay="+delay)

	    // Process command prefix controls then runCommand
	    // Prefix "CLEAR::" will cause the chord keys to be cleared on next "UP"
	    // so that a button can be used for single press as well as part of chord
	    // First we will check if there are any _dX available

	    let cmd = ""
	    if (typeof conf.buttons[keyIndex][commID+"_d"+delay] !== 'undefined') {
              commID = commID+"_d"+delay;
	    } else if (delay>0 && typeof conf.buttons[keyIndex][commID+"_d"+(delay+1)] !== 'undefined') {
              commID = commID+"_d"+(delay+1);
	    } else if (delay>1 && typeof conf.buttons[keyIndex][commID+"_d"+(delay-1)] !== 'undefined') {
              commID = commID+"_d"+(delay-1);
	    }
            cmd = conf.buttons[keyIndex][commID];

	    if (cmd.match(/^CLEAR::/)) {
		    cmd=cmd.replace(/^CLEAR::/,"");
		    clearKeys=currentKeys;
	    }

	    console.log(`commID=${commID} cmd search :: ${cmd}`)
	    //console.log(conf.buttons[keyIndex])

            // --| If command is not set, return
            if (cmd == "") { return; }

            if (cmd == "reload_config") {
                conf = await config.readConfig();
                await setDeviceSettings("Reloading Config");
                return;
            }

            if (cmd == "shift") {
              if (shift == 0) {	
		shift = keyIndex * 10 + 1
	      } else {
	        shift += 1
	      }
	      shiftTime = new Date().getTime()
	      console.log("GET SHIFTY" + shift + " " + shiftTime)
              await qkDevice.showOverlayText(1, "Shift"+shift);
              return;
	    }

	    if (cmd.match(/^config=/)) {
                var cf = cmd.replace(/^config=/,"")
                conf = await config.readConfig({configPath:cf});
                await setDeviceSettings("Reloading Config");
                return;
            }

            let output = await commands.runCommand(cmd);
            if (output != "") {
                output = output.toString();
            }

	    shift = 0;

	    console.log("OUTPUT="+output)
	    if (typeof(conf.buttons[keyIndex][commID+'_flash']) !== 'undefined') {
              await qkDevice.showOverlayText(1, conf.buttons[keyIndex][commID+'_flash']);
	      return;
	    }

            // --| If overlay text is not set, return
//            if (typeof conf.buttons[keyIndex].press_overlay == 'undefined' ||
//                typeof conf.buttons[keyIndex].press_overlay.text == 'undefined' ||
//                conf.buttons[keyIndex].press_overlay.text == "") { return; }
            let overlay_text = conf.buttons[keyIndex].press_overlay.text;
    console.log(overlay_text)

            if (overlay_text.includes("%output%") && output != "") {
                let tmpOutput = "";
                let tmpReplace = "";

                if (overlay_text.includes("%output%.%")) {
                    tmpReplace = "%output%.%";
                    let output_arr = output.split(".");
                    tmpOutput = output_arr[output_arr.length - 1];
                } else {
                    tmpReplace = "%output%";
                    tmpOutput = output;
                }
                let textLen = overlay_text.length;
                let outputLen = tmpOutput.length;
                let totalLen = textLen + outputLen;

                if (totalLen > 32) {
                    let diff = totalLen - 32;
                    output = output.substring(textLen, outputLen - diff);
                }

                overlay_text = overlay_text.replace(tmpReplace, tmpOutput);
            }

            await qkDevice.showOverlayText(conf.buttons[keyIndex].press_overlay.duration, overlay_text);
        } catch (e: unknown) {
            let msg = ""
            if (typeof e === "string") {
                msg = e.toUpperCase()
            } else if (e instanceof Error) {
                msg = e.message
            }

            console.error(msg);
            let logFile = path.join(__dirname, "error.log");
            fsPromises.appendFile(logFile, msg.toString());
        }
    });

    // --| Perform Wheel actions -----------
    // --| Allows an array of commands -----
    qkDevice.on('wheel', async (e) => {
	// We will look for "command" or if there are other keys held... command_key_key...
	var commID = currentKeys.length > 0 ? `command_${currentKeys.sort().join("_")}` : "command"
        let cmd = conf.wheel[e][commID] || ":"

	// Process command prefix controls then runCommand
	// Prefix "CLEAR::" will cause the chord keys to be cleared on next "UP"
	// so that a button can be used for single press as well as part of chord
	if (cmd.match(/^CLEAR::/)) {
	    cmd=cmd.replace(/^CLEAR::/,"");
	    clearKeys=currentKeys;
	}
        if (Array.isArray(cmd)) {
            cmd.forEach(async (c) => {
                let output = await commands.runCommand(c);
                if (output !== "") {
                    let displayText = `${conf.wheel[e].press_overlay.text} ${output}`;
                    await qkDevice.showOverlayText(conf.wheel[e].press_overlay.duration, displayText); return;
                } else { await qkDevice.showOverlayText(conf.wheel[e].press_overlay.duration, conf.wheel[e].press_overlay.text) }
            })
        } else {
            let output = await commands.runCommand(cmd)
            if (output !== "") {
                let displayText = `${conf.wheel[e].press_overlay.text} ${output}`;
                await qkDevice.showOverlayText(conf.wheel[e].press_overlay.duration, displayText); return;
            } else { await qkDevice.showOverlayText(conf.wheel[e].press_overlay.duration, conf.wheel[e].press_overlay.text) }
        }
    });

    // --| Log running errors --------------
    qkDevice.on('error', (error) => { console.error(error) });

    // --| Set initial device settings -----
    await setDeviceSettings();

    await sleep(1100).then(async () => {
        input.start();
        input.on('notification', async (data: any) => {
            console.log(data.message);
            let duration = 2;
            if (data.duration !== undefined) { duration = Number.parseInt(data.duration); }
            console.log(duration);
            await device.showOverlayText(duration, data.message);
        });

        input.on('reload', async (_data: any) => {
            console.log("Reloading Settings");
            conf = await config.readConfig();
            await setDeviceSettings();
        });
    });
})

// --| Run upon device disconnect ---------------
XencelabsQuickKeysManagerInstance.on('disconnect', async (qkDevice) => {
    let notify_path = path.join(__dirname, "../", "scripts/notify-send.sh");
    let system_notify = `${notify_path} 'QuickKeys' 'QuickKeys Disconnected'`;
    await commands.runCommand(system_notify);
    console.log('disconnected %s', qkDevice.deviceId)
    console.log(`Going nasty to kill myself... pid ${process.pid}`);
    commands.runCommand(`kill -9 ${process.pid}`);
    process.exit(); // Doesnt work
    exit(0) // Doesnt work
})

// --| Log detected connection errors -----------
XencelabsQuickKeysManagerInstance.on('error', (error) => {
    console.error(error);
    exit(1);
})

// --| Locate connected device ------------------
console.log('Looking for connected device...')
XencelabsQuickKeysManagerInstance.scanDevices()

// --| If device not found ----------------------
checkDevice()

// vim: ts=2 sw=2 et
