const { each } = require("lodash");
const moment = require("moment");

module.exports = function Util(bot) {
  class RouletteUtil {
    constructor() {
      this.running = false;
      this.price = undefined;
      this.duration = undefined;
      this.players = [];
    }
    async start(duration, price) {
      this.running = true;
      this.duration = duration;
      this.price = price;

      await bot.redis.placeCommandOnCooldown("plug", "roulette@start", "perUse", 1, 3600);

      this.timeout = setTimeout(async () => {
        await this.sort();
      }, duration * 1e3);
    }
    end() {
      this.running = false;
      this.price = undefined;
      this.duration = undefined;
      this.players = [];

      clearTimeout(this.timeout);

      return true;
    }
    async check(cooldown) {
      if (cooldown) {
        return bot.redis.getCommandOnCoolDown("plug", "roulette@start", "perUse");
      }

      return this.running;
    }
    add(id) {
      if (!this.players.includes(id)) {
        this.players.push(id);
        return true;
      }

      return false;
    }
    static position(currentPosition, waitlistLength) {
      // the highest position you can go to is 5
      // users outside the list have a chance to get at least pos 35
      return currentPosition !== -1 ?
        Math.floor(Math.random() * (currentPosition - 5)) + 5 :
        Math.floor(Math.random() * Math.min(waitlistLength, 35)) + 5;
    }
    async multiplier(players, isIn) {
      // multipler for users outside the waitlist
      const outside = [
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
        3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
      ];
      // multipler for users inside the waitlist
      const inside = [
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
        3, 3, 3, 3, 3,
      ];

      return isIn ? (inside[players] || 2) : (outside[players] || 3);
    }
    async winner(players) {
      const winner = players[Math.floor(Math.random() * players.length)];
      const user = bot.plug.getUser(winner);
      const waitlist = bot.plug.getWaitList();

      if (!players.length && this.end()) {
        await bot.plug.sendChat(bot.lang.roulette.somethingwrong);
        return;
      }

      const position = this.constructor.position(bot.plug.getWaitListPosition(winner), waitlist.length);

      if (!user || typeof user.username !== "string" || !user.username.length) {
        this.winner(players.filter(player => player !== winner));
        return;
      }

      const day = moment().isoWeekday();
      const isWeekend = (day === 5) || (day === 6) || (day === 7);

      if (isWeekend) {
        const random = Math.floor(Math.random() * (50 - 10 + 1)) + 10;

        const [holidayUser] = await bot.db.models.holiday.findOrCreate({
          where: { id: user.id }, defaults: { id: user.id },
        });

        await holidayUser.increment("currency", { by: random });

        //await bot.plug.sendChat(user.username + " won " + random + " :fplcandy:");
      }

      await bot.plug.sendChat(bot.utils.replace(bot.lang.roulette.winner, {
        winner: user.username,
        position: position,
      }));
      this.end();
      bot.queue.add(user, position);
    }
    async sort() {
      if (!this.players.length && this.end()) {
        return bot.plug.sendChat(bot.lang.roulette.noplayers);
      }

      this.running = false;

      const alteredOdds = [];

      each(this.players, (player) => {
        if (bot.plug.getUser(player)) {
          if (bot.plug.getWaitListPosition(player) === -1) {
            alteredOdds.push(...Array(this.multiplier(this.players.length, false)).fill(player));
          } else {
            alteredOdds.push(...Array(this.multiplier(this.players.length, true)).fill(player));
          }
        }
      });

      return this.winner(alteredOdds);
    }
  }

  bot.roulette = new RouletteUtil();
};