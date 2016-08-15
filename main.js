'use strict';

var PokemonGO = require('pokemon-go-node-api');
var pokedex = require('./pokedex_hk.json').pokemon;
var PushBullet = require('pushbullet');

var config = require('./config.json');

if(!config.username || !config.password || !config.latitude || !config.longitude || !config.pushbullet_token || !config.pushbullet_accounts)
    throw new Error('Missing config. Please check config.json.');

var pusher = new PushBullet(config.pushbullet_token);

var pokeio = new PokemonGO.Pokeio();

var coords = {
    'latitude': +config.latitude,
    'longitude': +config.longitude,
    'altitude': '0'
}

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

var username = config.username;
var password = config.password;
var provider = 'google';

pokeio.init(username, password, location, provider, function(err) {
    if (err) throw err;

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
            pokeio.Heartbeat(function(err,hb) {
                if(err) {
                    console.log(err);
                }

                if(!hb || !hb.cells) {
                    return;
                }

                hb.cells.forEach((cell) => {
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

                                var pokemonData = pokedex[parseInt(pkm.pokemon.PokemonId)-1];

                                var title = pokemonData.name_hk + ' ' + pokemonData.name + ' | Time left (s): ' + pkm.TimeTillHiddenMs / 1000;
                                var body = getGoogleMapLink(pkm.Latitude, pkm.Longitude);

                                config.pushbullet_accounts.forEach((account) => {
                                    pusher.note(account, title, body, (err, res) => {
                                        if(err)
                                            console.error(err);
                                    });
                                });

                                console.log((new Date()).toString());
                                console.log(title);
                                console.log(body);
                            }
                        });
                    }
                });

                // move to next coord for searching
                var newCoords = {
                    'latitude': coords.latitude + coordDiff[0][0],
                    'longitude': coords.longitude + coordDiff[0][1],
                    'altitude': '0'
                };

                location.coords = newCoords;

                pokeio.SetLocation(location, (err, coords) => {
                    if(err)
                        console.error(err);
                });

                // rotate coordDiff
                var shifted = coordDiff.shift();
                coordDiff.push(shifted);
            });
        }, 5000);

    });
});

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