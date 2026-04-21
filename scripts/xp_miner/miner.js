const mineflayer = require('mineflayer')

const autoeat = require('mineflayer-auto-eat').loader

const bot = mineflayer.createBot({
    host: 'localhost',
    port: 25565,
    username: 'xp_miner'
})

// Load the plugin into the bot
bot.loadPlugin(autoeat)

bot.on('spawn', () => {
    console.log("Bot operational");

    setInterval(() => {
        const entity = bot.nearestEntity((entity) => {
            return (entity.type === 'mob' || entity.type === 'hostile') && bot.entity.position.distanceTo(entity.position) < 6;
        });

        if (entity) {
            bot.attack(entity);
            bot.swingArm('right');
        }
    }, 1000);
});

// Optional plugin configuration
bot.once('spawn', () => {
    bot.autoEat.setOpts({
        priority: 'foodPoints',
        bannedFood: ['rotten_flesh', 'pufferfish'],
        eatingTimeout: 3000
    })
    bot.autoEat.enableAuto()
})

setInterval(() => {
    // Data extraction from the experience object
    const xpPoints = bot.experience.points;
    const xpLevel = bot.experience.level;
    const xpProgress = (bot.experience.progress * 100).toFixed(2); // Conversion to percentage

    console.log(`[LOG] Experience: ${xpPoints} pts | Level: ${xpLevel} | Progress: ${xpProgress}%`);
}, 60000);
