# Pokemon Go Fixed Location Notification System
Leisure project for tracking fixed location pokemons, best suit for Pokemon trainers that only wants to launch Pokemon Go app when there is rare Pokemon to catch nearby. Integrated with Pushbullet for cross-platform notifications.

## Features
* Support searching pokemons nearby (so you can stay at home and Catch 'Em All)
* Support pokemons from lure module
* Support pushbullet and hipchat integration
* Support notification by pokemon tier
* Support Hong Kong version pokemon names

## Setup
Create `config.json` by cloning `config.json.template`

Field | Description
--- | ---
username | Your Pokemon Go login username
password | Your Pokeon Go login password
provider | google / ptc (Pokemon trainer club)
latitude | Latitude of the location that you want to keep track
longitude | Longitude of the location that you want to keep track
do_not_notify | Array of Pokemon names in English which skip notifying user
notification_providers | { "provider_name": "options" }

## Notification Providers
### Pushbullet
Create a [Pushbullet account](https://www.pushbullet.com)

provider_name: pushbullet

options:

Field | Description
--- | ---
token | Get one from Pushbullet [Account Settings](https://www.pushbullet.com/#settings/account)
deviceParams | Your pushbullet account email address, or target patameters defined [here](https://docs.pushbullet.com/#create-push)

### Hipchat
provider_name: hipchat

options:

Field | Description
--- | ---
token | Obtain Hipchat [personal access token](https://www.hipchat.com/account/api)
roomid | your room id, can be found on the path when you enter the room
endpoint | Hipchat endpoint

Install required dependencies:
```
npm install
```

Install forever
```
npm install forever -g
```

Launch the system by:
```
forever main.js
```

## Screenshot
![screenshot1](docs/screenshot1.jpg)