//var fs = require('fs');

var pokemonTier = require('./pokemon_tier.json');

var sortedTier = {
	0: [],
	1: [],
	2: [],
	3: [],
	4: [],
	5: [],
	6: [],
};

pokemonTier.pokemon.forEach((pokemon) => {
	sortedTier[pokemon.tier].push(pokemon.name_hk);
});

console.log(sortedTier);
