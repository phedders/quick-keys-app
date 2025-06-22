# quick-keys-app

An app for Xencelabs QuickKeys to run whatever system commands, which are assigned via config file.

I don't know Typescript/Node very well, so I am sure things are not "best practice". It works for my purposes, though.

Using the following Library:  
https://github.com/Julusian/node-xencelabs-quick-keys

As mentioned above, since I don't know much about Typescript/Node, this started project was used to bootstrap:  
 https://github.com/stemmlerjs/simple-typescript-starter

## Feature updates in 2024/5
### Chording
Pressing multiple keys at once gives you almost infinite combinations:
```
[buttons.1]
command_8 = "...."   # Hold key 8 and press 1
comand_8_0 = "...."   # Hold key 8, and 0, and press 1
command_8_0_2 = "...." # Hold 8,0,2 and press 1
```

Chording can get complicated and have side effects of hitting other commands as you lift keys. To get around this you can set a reset by prepending the commands action with "CLEAR::"

```
# Clear the chord keys to avoid button 8 triggering
command_8 = "CLEAR::firefox"
```

This is really useful with the command wheel - think of using it for mixing - I send commands to a Behringer X32 using OSC to control the 8 DCA's

```
[wheel.left]
command_0 = "oscsend ... dca1 -1"
command_1 = "oscsend ... dca2 -1"
command_2 = "oscsend ... dca3 -1"
command_3 = "oscsend ... dca4 -1"
...
[wheel.right]
command_0 = "oscsend ... dca1 +1"
command_1 = "oscsend ... dca2 +1"
command_2 = "oscsend ... dca3 +1"
command_3 = "oscsend ... dca4 +1"
...
```

### Shift keys
Here I am using the lowest key "Button 8" as a Shift - you can have 9 Shift layers... _s81 _s82 _s83 ..._s89
And you can make any button a shift, eg _s11 would be key1 shifted once.

```
# --| Button 8 -------------------
[buttons.8]
  text = ""
  command = "shift"      # On press sets a shift
  command_s81 = "shift"  # Press again hits the shift and applies again
  command_s82 = "shift"  # ... And again
  command_s83 = "config=config-select.toml"   # This time load my menu
```

This works by giving the command "shift". Each time you press that key within the shift timeout, the shift *for that key* increases.

Then you can use a modifier for other actions '_s\<K\>\<S\>' where Key is the key and S is the number of shifts applied. In the above example pressing once sets 1 shift level. Pressing it again kits _s81 and then applies another shift level (2).. same for _s82 which will set shift level 3. On _s83 I load a new config (my master config select)

Obviously you can apply the current shift to any key

```
[buttons.1]
  command_s82 = "echo You kit button1 after 2x button 8 shifts"
```

### Delay / Hold
Now you can do different actions by holding the buttons down - and yes you can do this with shifts and chords...

```
  command_d2 = "config=config-select.toml"
```

This time I jump to my master config menu by holding a key down for 2 seconds.

```
  command_s83_d1 = "config=config-select.toml"
```
Or do the jump if I have first hit key 8 3 times with 3 shifts and then hold this key for 1 second.

### Flash messages instead of overrides
The original override messages are useful - but not with chords, shifts and delays. But you can now do a flash message for each command line by appending _flash

```
[buttons.1]
command_s81 = "sudo reboot"
command_s81_flash = "rebooting!"
```
NB _flash does not yet work with the wheel

## Systemd startup
I have included a simple service file that you can modify and place in your .config tree eg

```
~/.config/systemd/user/quickkeys.service
```

Modify it for you paths, then enable it:
```
systemctl --user daemon-reload
systemctl --user enable --now quickkeys.service
``` 
