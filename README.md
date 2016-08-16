# Pokemon Go Fixed Location Notification System
Leisure project for tracking fixed location pokemons, best suit for Pokemon trainers that only wants to launch Pokemon Go app when there is rare Pokemon to catch nearby. Integrated with Pushbullet for cross-platform notifications.

## Setup
Create `config.json` by cloning `config.json.template`

Field | Description
--- | ---
username | Your Pokemon Go login username (only support google login at this moment)
password | Your Pokeon Go login password
latitude | Latitude of the location that you want to keep track
longitude | Longitude of the location that you want to keep track
pushbullet_token | Get one from Pushbullet [Account Settings](https://www.pushbullet.com/#settings/account)
pushbullet_accounts | Array of Pushbullet accounts for receiving notification. Create a [Pushbullet account](https://www.pushbullet.com)
do_not_notify | Array of Pokemon names in English which skip notifying user

Install required dependencies:
```
npm install
```

Launch the system by:
```
node main.js
```