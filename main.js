'use strict';

var PokemonGO = require('pokemon-go-node-api');
var pokedex = require('./pokedex_hk.json').pokemon;
var pokemon_tier = require('./pokemon_tier.json');
var PushBullet = require('pushbullet');
var Long = require('long');
var request = require('request');

var config = require('./config.json');

if(!config.username || !config.password || !config.provider || !config.latitude || !config.longitude)
    throw new Error('Missing config. Please check config.json.');

var doNotNotify = [];
if(Array.isArray(config.do_not_notify))
    doNotNotify = config.do_not_notify;

var notification_providers = config.notification_providers;
var pusher;
if(notification_providers && notification_providers.pushbullet && notification_providers.pushbullet.token)
    pusher = new PushBullet(notification_providers.pushbullet.token);

var pokeio = new PokemonGO.Pokeio();

var userLocation = {
    'latitude': +config.latitude,
    'longitude': +config.longitude,
    'altitude': 0
};

var location = {
    type: 'coords',
    coords: userLocation
};

var radiusInLatLon = 0.0002;
if(config.radius)
    radiusInLatLon = config.radius;

var coordDiff = [
    [0, 0],
    [radiusInLatLon, 0],
    [-radiusInLatLon, 0],
    [0, radiusInLatLon],
    [0, -radiusInLatLon],
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
    if (err) throw err;

    // console.log('token: ' + pokeio.playerInfo.accessToken);

    console.log('1[i] Current location: ' + pokeio.playerInfo.locationName);
    console.log('1[i] lat/long/alt: : ' + pokeio.playerInfo.latitude + ' ' + pokeio.playerInfo.longitude + ' ' + pokeio.playerInfo.altitude);

    pokeio.GetProfile(function(err, profile) {
        if (err) throw err;

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
            if(isHandlingError) {
                console.log('Handling error...');
                return;
            }

            pokeio.Heartbeat(function(err,hb) {
                if(err) {
                    handleHeartbeatError(err);
                    return;
                }

                if(!hb || !hb.cells) {
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

    if(isHandlingError) {
        console.log('Handling error');
        return;
    }

    if(loginRetryCount >= loginRetryLimit)
        throw new Error('Reach login retry limit!');

    isHandlingError = true;
    loginRetryCount++;

    console.log('Wait a while before refreshing token...');

    setTimeout(() => {
        console.log('Try to refresh token... ' + loginRetryCount);

        pokeio.init(username, password, location, provider, (err) => {
            if(err) {
                console.error('Refresh token error: ' + err);
            } else {
                console.log('Refresh token complete');
                // console.log('token: ' + pokeio.playerInfo.accessToken);
            }

            isHandlingError = false;
        });
    }, sleepBeforeRefresh);
}

function handleHeartbeatCell(cell) {
    // for wild pokemon
    if(cell.WildPokemon[0]) {
        // console.log(cell.WildPokemon);
        cell.WildPokemon.forEach((pkm) => {
            var SpawnPointId = pkm.SpawnPointId;

            // if pkm not exist in map
            if(!spawnMap.hasOwnProperty(SpawnPointId)) {
                spawnMap[SpawnPointId] = pkm;
                spawnList.push(SpawnPointId);

                if(spawnList.length > recycleLength)
                    recycleSpawnMap();

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
    if(cell.Fort[0]) {
        // console.log(cell.Fort);

        cell.Fort.forEach((fort) => {
            if(fort.LureInfo) {
                var lureInfo = fort.LureInfo;
                // console.log(fort.LureInfo);

                var fortId = lureInfo.FortId;
                var lureExpiresTimestampMs = +lureInfo.LureExpiresTimestampMs.toString();
                var pokemonId = lureInfo.ActivePokemonId;
                var latitude = fort.Latitude;
                var longitude = fort.Longitude;

                if(lureStopMap[fortId] && lureStopMap[fortId] === lureExpiresTimestampMs) {
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
        'latitude': userLocation.latitude + coordDiff[0][0],
        'longitude': userLocation.longitude + coordDiff[0][1],
        'altitude': 0
    };

    location.coords = newCoords;

    pokeio.SetLocation(location, (err, coords) => {
        if(err) console.error(err);
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
    if(index !== -1) {
        console.log('Skipped ' + pokemonData.name);
        return;
    }

    var lureFlag = '';
    if(params.spawnType && params.spawnType === 'LURE')
        lureFlag = '*';

    var tier = pokemon_tier.pokemon[parseInt(params.pokemonId) - 1].tier;
    var tier_displayname = pokemon_tier.tier_displayname[tier];

    var distance = parseInt(getDistanceFromLatLonInM({
        latitude: params.latitude,
        longitude: params.longitude
    }, {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude
    }));

    var title = tier_displayname + ' ' + lureFlag + pokemonData.name_hk + ' ' + pokemonData.name + ' ' + msToMMSS(params.timeTillHiddenMs) + ' ' + distance + 'm';
    var body = getGoogleMapLink(params.latitude, params.longitude);

    // TODO: support multiple providers

    // for pushbullet
    if(pusher) {
        pusher.note(notification_providers.pushbullet.deviceParams, title, body, (err, res) => {
            if(err)
                console.error(err);
        });
    }

    // for hipchat
    if(notification_providers.hipchat && tier < 6) {
        var hipchat = notification_providers.hipchat;
        var endpoint = hipchat.endpoint + '/v2/room/' + hipchat.roomid + '/notification';

        var color = 'gray';
        var mention = '';

        // change noti by tier
        if(tier <= 4)
            color = 'yellow';
        if(tier <= 3)
            mention = '@all';
        if(tier <= 2)
            color = 'red';

        var message = title + ' ' + body + ' ' + mention;

        var options = {
            'url': endpoint,
            'method': "POST",
            'auth': {
                'bearer': hipchat.token
            },
            'json': {
                "from": "PoGo Notification",
                "message_format": "text",
                "message": message,
                "color": color,
                "notify": true
            }
        };

        request(options, (err) => {
            if(err)
                console.error(err);
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
    for(var i = 0; i < recycleLength / 2; i++) {
        var spawnPointId = spawnList.shift();
        delete spawnMap[spawnPointId];
    }
    console.log('Recycle complete, count: ' + i);
    console.log('spawnList size: ' + spawnList.length);
}

function msToMMSS(ms) {
    return new Date(ms).toTimeString().substring(3, 8);
}

function getDistanceFromLatLonInM(coord1, coord2) {
    var lat1 = coord1.latitude;
    var lon1 = coord1.longitude;
    var lat2 = coord2.latitude;
    var lon2 = coord2.longitude;

    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2-lat1);  // deg2rad below
    var dLon = deg2rad(lon2-lon1); 
    var a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2)
        ; 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; // Distance in km
    return d * 1000;    // Distance in m
}

function deg2rad(deg) {
    return deg * (Math.PI/180)
}