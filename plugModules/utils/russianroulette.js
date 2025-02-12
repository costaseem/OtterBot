const { ROOM_ROLE, GLOBAL_ROLES } = require("plugapi");

module.exports = function Util(bot) {
  class RussianRouletteUtil {
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

      await bot.redis.placeCommandOnCooldown("plug", "russianroulette@start", "perUse", 1, 10800);

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
        return bot.redis.getCommandOnCoolDown("plug", "russianroulette@start", "perUse");
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
    async chooseVictim(players) {
      this.running = false;

      const victim = players[Math.floor(Math.random() * players.length)];
      const user = bot.plug.getUser(victim);
      const waitlist = bot.plug.getWaitList();

      if (!players.length) {
        await bot.plug.sendChat(bot.lang.russianroulette.countOver);
        this.end();
        return;
      }

      if (!user || typeof user.username !== "string" || !user.username.length) {
        await bot.plug.sendChat(bot.utils.replace(bot.lang.russianroulette.chicken, {
          user: victim,
        }));

        await bot.redis.removeDisconnection(victim);
        this.chooseVictim(players.filter(player => player !== victim));
        return;
      }

      await bot.wait(3000);
      await bot.plug.sendChat(bot.utils.replace(bot.lang.russianroulette.shot, {
        user: user.username,
      }));
      await bot.wait(5000);

      const randomBool = Math.random() >= 0.5;

      const luckyshot = Math.floor(Math.random() * (bot.plug.getWaitListPosition(victim) - 5)) + 5;
      const unluckyshot = Math.floor(Math.random() * (waitlist.length - bot.plug.getWaitListPosition(victim)) + bot.plug.getWaitListPosition(victim) + 1);

      if (randomBool) {
        await bot.plug.sendChat(bot.utils.replace(bot.lang.russianroulette.luckyshot, {
          user: user.username,
        }));

        if (bot.plug.getWaitListPosition(victim) === -1) {
          bot.queue.add(user, waitlist.length);
  
          this.chooseVictim(players.filter(player => player !== victim));
          return;
        }

        bot.queue.add(user, luckyshot);
      }
      else {
        await bot.plug.sendChat(bot.utils.replace(bot.lang.russianroulette.unluckyshot, {
          user: user.username,
        }));

        if (bot.plug.getWaitListPosition(victim) === -1 && (user.role <= ROOM_ROLE.BOUNCER && user.gRole < GLOBAL_ROLES.MODERATOR)) {
          if (user.role <= ROOM_ROLE.BOUNCER && user.gRole < GLOBAL_ROLES.MODERATOR) {
            const { role } = user;

            await bot.plug.moderateSetRole(user.id, ROOM_ROLE.NONE, async function() {
              await bot.plug.moderateMuteUser(user.id, bot.plug.MUTE_REASON.VIOLATING_COMMUNITY_RULES, bot.plug.MUTE.SHORT, async function() {
                await bot.plug.moderateSetRole(user.id, role);
              });
            });

            this.chooseVictim(players.filter(player => player !== victim));
            return;
          }

          await bot.plug.moderateMuteUser(user.id, bot.plug.MUTE_REASON.VIOLATING_COMMUNITY_RULES, bot.plug.MUTE.SHORT);
  
          this.chooseVictim(players.filter(player => player !== victim));
          return;
        }
        
        bot.queue.add(user, unluckyshot);
      }

      this.chooseVictim(players.filter(player => player !== victim));
    }
    async sort() {
      this.running = false;

      const alteredOdds = this.players;

      return this.chooseVictim(alteredOdds);
    }
  }

  bot.russianRoulette = new RussianRouletteUtil();
};