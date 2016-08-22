'use strict';

var PokemonGO = require('pokemon-go-node-api');
var pokedex = require('./pokedex_hk.json').pokemon;
var pokemonTier = require('./pokemon_tier.json');
var PushBullet = require('pushbullet');
// var Long = require('long');
var request = require('request');

var config = require('./config.json');

if (!config.username) throw new Error('Missing config: username not found. ');
if (!config.password) throw new Error('Missing config: password not found. ');
if (!config.provider) throw new Error('Missing config: provider not found. ');
if (!config.latitude) throw new Error('Missing config: latitude not found. ');
if (!config.longitude) throw new Error('Missing config: longitude not found. ');

var doNotNotify = [];
if (Array.isArray(config.do_not_notify)) {
  doNotNotify = config.do_not_notify;
}

var notificationProviders = config.notification_providers;
var pusher;
if (notificationProviders && notificationProviders.pushbullet && notificationProviders.pushbullet.token) {
  pusher = new PushBullet(notificationProviders.pushbullet.token);
}

var pokeio = new PokemonGO.Pokeio();

var coords = {
  'latitude': +config.latitude,
  'longitude': +config.longitude,
  'altitude': 0
};

var location = {
  type: 'coords',
  coords: coords
};

var coordDiff = [
  [0, 0],
  [0.000300, 0],
  [-0.000300, 0],
  [0, 0.000300],
  [0, -0.000300],
];

var spawnMap = {};
var spawnList = [];
var recycleLength = 100;

var lureStopMap = {};

var isHandlingError = false;
var loginRetryLimit = 1;
var loginRetryCount = 0;
var sleepBeforeRefresh = 10000;

var username = config.username;
var password = config.password;
var provider = config.provider;

pokeio.init(username, password, location, provider, function(err) {
  if (err) {
    throw err;
  }

  // console.log('token: ' + pokeio.playerInfo.accessToken);

  console.log('1[i] Current location: ' + pokeio.playerInfo.locationName);
  console.log('1[i] lat/long/alt: : ' + pokeio.playerInfo.latitude + ' ' + pokeio.playerInfo.longitude + ' ' + pokeio.playerInfo.altitude);

  pokeio.GetProfile(function(err, profile) {
    if (err) {
      throw err;
    }

    console.log('1[i] Username: ' + profile.username);
    console.log('1[i] Poke Storage: ' + profile.poke_storage);
    console.log('1[i] Item Storage: ' + profile.item_storage);

    var poke = 0;
    if (profile.currency[0].amount) {
      poke = profile.currency[0].amount;
    }

    console.log('1[i] Pokecoin: ' + poke);
    console.log('1[i] Stardust: ' + profile.currency[1].amount);

    setInterval(function(){
      if (isHandlingError) {
        console.log('Handling error...');
        return;
      }

      pokeio.Heartbeat(function(err,hb) {
        if (err) {
          handleHeartbeatError(err);
          return;
        }

        if (!hb || !hb.cells) {
          return;
        }

        loginRetryCount = 0;

        // digest each heartbeat cell
        hb.cells.forEach(handleHeartbeatCell);

        // move to next coord for searching
        walkToNextLocation();
      });
    }, 5000);

  });
});

function handleHeartbeatError(err) {
  console.error(err);

  if (isHandlingError) {
    console.log('Handling error');
    return;
  }

  if (loginRetryCount >= loginRetryLimit) {
    throw new Error('Reach login retry limit!');
  }

  isHandlingError = true;
  loginRetryCount++;

  console.log('Wait a while before refreshing token...');

  setTimeout(() => {
    console.log('Try to refresh token... ' + loginRetryCount);

    pokeio.init(username, password, location, provider, (err) => {
      if (err) {
        console.error('Refresh token error: ' + err);
      } else {
        console.log('Refresh token complete');
        console.log('token: ' + pokeio.playerInfo.accessToken);
      }

      isHandlingError = false;
    });
  }, sleepBeforeRefresh);
}

function handleHeartbeatCell(cell) {
  // for wild pokemon
  if (cell.WildPokemon[0]) {
    // console.log(cell.WildPokemon);
    cell.WildPokemon.forEach((pkm) => {
      var SpawnPointId = pkm.SpawnPointId;

      // if pkm not exist in map
      if (!spawnMap.hasOwnProperty(SpawnPointId)) {
        spawnMap[SpawnPointId] = pkm;
        spawnList.push(SpawnPointId);

        if (spawnList.length > recycleLength) {
          recycleSpawnMap();
        }

        publishNotification({
          pokemonId: pkm.pokemon.PokemonId,
          latitude: pkm.Latitude,
          longitude: pkm.Longitude,
          timeTillHiddenMs: pkm.TimeTillHiddenMs
        });
      }
    });
  }

  // for lured pokemons
  if (cell.Fort[0]) {
    // console.log(cell.Fort);

    cell.Fort.forEach((fort) => {
      if (fort.LureInfo) {
        var lureInfo = fort.LureInfo;
        // console.log(fort.LureInfo);

        var fortId = lureInfo.FortId;
        var lureExpiresTimestampMs = +lureInfo.LureExpiresTimestampMs.toString();
        var pokemonId = lureInfo.ActivePokemonId;
        var latitude = fort.Latitude;
        var longitude = fort.Longitude;

        if (lureStopMap[fortId] && lureStopMap[fortId] === lureExpiresTimestampMs) {
          // skip reported pokemon
          // console.log('skip reported pokemon')
          return;
        } else {
          // console.log('lureStopMap:' + lureStopMap);
          // console.log('fortId:' + fortId);
          // console.log('lureExpiresTimestampMs:' + lureExpiresTimestampMs);
          // update the map
          lureStopMap[fortId] = lureExpiresTimestampMs;

          publishNotification({
            pokemonId: pokemonId,
            latitude: latitude,
            longitude: longitude,
            timeTillHiddenMs: lureExpiresTimestampMs - new Date().getTime(),
            spawnType: 'LURE'
          });
        }
      }
    });
  }
}

function walkToNextLocation() {
  var newCoords = {
    'latitude': coords.latitude + coordDiff[0][0],
    'longitude': coords.longitude + coordDiff[0][1],
    'altitude': 0
  };

  location.coords = newCoords;

  pokeio.SetLocation(location, (err) => { //coords) => {
    if (err) {
      console.error(err);
    }
  });

  // rotate coordDiff
  var shifted = coordDiff.shift();
  coordDiff.push(shifted);
}

function publishNotification(params) {
  var pokemonData = pokedex[parseInt(params.pokemonId)-1];

  // check do_not_notify list
  var query = pokemonData.name.toLowerCase();
  var index = -1;
  doNotNotify.some(function(element, i) {
    if (query === element.toLowerCase()) {
      index = i;
      return true;
    }
  });

  // skip publish notification
  if (index !== -1) {
    console.log('Skipped ' + pokemonData.name);
    return;
  }

  var lureFlag = '';
  if (params.spawnType && params.spawnType === 'LURE') {
    lureFlag = '*';
  }

  var tier = pokemonTier.pokemon[parseInt(params.pokemonId) - 1].tier;
  var tierDisplayname = pokemonTier.tier_displayname[tier];

  var title = tierDisplayname + ' ' + lureFlag + pokemonData.name_hk + ' ' + pokemonData.name + ' ' + msToMMSS(params.timeTillHiddenMs);
  var body = getGoogleMapLink(params.latitude, params.longitude);

  // TODO: support multiple providers

  // for pushbullet
  if (pusher) {
    pusher.note(notificationProviders.pushbullet.deviceParams, title, body, (err) => { //, res) => {
      if (err) {
        console.error(err);
      }
    });
  }

  // for hipchat
  if (notificationProviders.hipchat && tier < 6) {
    var hipchat = notificationProviders.hipchat;
    var endpoint = hipchat.endpoint + '/v2/room/' + hipchat.roomid + '/notification';

    var color = 'gray';
    var mention = '';

    // change noti by tier
    if (tier <= 4) {
      color = 'yellow';
    }
    if (tier <= 3) {
      mention = '@all';
    }
    if (tier <= 2) {
      color = 'red';
    }

    var message = title + ' ' + body + ' ' + mention;

    var options = {
      'url': endpoint,
      'method': 'POST',
      'auth': {
        'bearer': hipchat.token
      },
      'json': {
        'from': 'PoGo Notification',
        'message_format': 'text',
        'message': message,
        'color': color,
        'notify': true
      }
    };

    request(options, (err) => {
      if (err) {
        console.error(err);
      }
    });
  }

  console.log((new Date()).toString());
  console.log('>>>' + title);
  console.log(body);
}

function getGoogleMapLink(lat, lon) {
  var ll = lat + ',' + lon;
  return 'http://maps.google.com/maps?q=' + ll + '&ll=' + ll + '&z=18';
}

function recycleSpawnMap() {
  var i;
  for (i = 0; i < recycleLength / 2; i++) {
    var spawnPointId = spawnList.shift();
    delete spawnMap[spawnPointId];
  }
  console.log('Recycle complete, count: ' + i);
  console.log('spawnList size: ' + spawnList.length);
}

function msToMMSS(ms) {
  return new Date(ms).toTimeString().substring(3, 8);
}
