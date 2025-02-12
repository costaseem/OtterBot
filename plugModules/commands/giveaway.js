const { isNil, reject } = require("lodash");

module.exports = function Command(bot) {
  bot.plugCommands.register({
    names: ["giveaway"],
    minimumPermission: 4000,
    cooldownType: "perUse",
    cooldownDuration: 180,
    parameters: "<Winners>",
    description: "Giveaway.",
    async execute(rawData, command, lang) { // eslint-disable-line no-unused-vars
      if (!rawData.args.length) return;
      return;

      let winners = rawData.args.join(" ");

      const playersBD = await bot.db.models.holiday.findAll({
        where: { ticket: true }
      });

      let players = [];

      if (!isNil(playersBD)) {
        for (const player of playersBD) {
          if (!players.includes(player.id)) {
            players.push(player.id);
          }
        }
      }

      let i = 1;

      while (winners > 0) {
        if (players.length <= 0) return;
        
        const winner = players[Math.floor(Math.random() * players.length)];
        const user = bot.plug.getUser(winner);

        if (!user || typeof user.username !== "string" || !user.username.length) {
          //await bot.plug.sendChat("User Offline! Picking up someone else...");
          const userBD = await bot.db.models.users.findOne({
            where: {
              id: winner,
            },
          });

          await bot.plug.sendChat("Winner " + i + " - " + userBD.get("username"));
          console.log(user.id);

          players = reject(players, function(player) { return player === winner; });
          await bot.wait(5000);

          i++;
          winners--;
        } else {

          await bot.plug.sendChat("Winner " + i + " - " + user.username);
          console.log(user.id);

          players = reject(players, function(player) { return player === winner; });
          await bot.wait(5000);

          i++;
          winners--;
        }
      }

      return true;
    },
  });
};