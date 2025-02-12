const { isNil, isNaN, isObject } = require("lodash");
const { ROOM_ROLE, GLOBAL_ROLES } = require("plugapi");
const { Op, fn, col } = require("sequelize");
const moment = require("moment");

module.exports = function Util(bot) {
  const util = {
    name: "updateRDJ",
    function: async (id) => {
      if (isNil(id)) return false;

      const user = bot.plug.getUser(id);

      const totalsongs = await bot.db.models.plays.count({
        where: { skipped: false }
      });

      const playsmehcount = await bot.db.models.plays.count({
        where: {
          skipped: true,
          mehs: {
            [Op.gt]: 4
          }
        }
      });

      const totalmessages = await bot.db.models.messages.count({
        where: { id: id, command: false }
      });

      const userDB = await bot.db.models.users.findOne({
        where: {
          id: id
        },
      });

      if (isNil(userDB)) {
        await bot.plug.moderateSetRole(id, ROOM_ROLE.NONE);
        return true;
      }

      const propsgiven = await bot.db.models.props.count({ where: { id } });

      const playscount = await bot.db.models.plays.count({
        where: { dj: id, skipped: false }
      });

      const bancount = await bot.db.models.bans.count({
        where: { id: id, type: "BAN" }
      });

      const mutecount = await bot.db.models.bans.count({
        where: { id: id, type: "MUTE" }
      });

      const wlbancount = await bot.db.models.bans.count({
        where: { id: id, type: "WLBAN" }
      });

      const songvotes = await bot.db.models.plays.findAll({
        attributes: [
          [fn("SUM", col("plays.woots")
          ), "totalwoots"],
          [fn("SUM", col("plays.grabs")
          ), "totalgrabs"]],
        where: {
          dj: id,
          skipped: false
        },
        group: ["dj"]
      });

      const songVotesMehs = await bot.db.models.plays.findAll({
        attributes: [
          [fn("SUM", col("plays.mehs")
          ), "totalmehs"]],
        where: {
          dj: id
        },
        group: ["dj"]
      });

      const totalbans = ((bancount * bot.global.pointsWeight.ban) + (mutecount * bot.global.pointsWeight.mute) + (wlbancount * bot.global.pointsWeight.wlban)) * 100;

      const propsGivenPoints = propsgiven * bot.global.pointsWeight.propsGiven;
      const totalMessagesPoints = (totalmessages + userDB.get("points")) * bot.global.pointsWeight.messages;

      let totalWootsPoints = 0;
      let totalGrabsPoints = 0;
      let totalMehsPoints = 0;

      if (!isNil(songvotes[0])) {
        totalWootsPoints = songvotes[0].dataValues.totalwoots * bot.global.pointsWeight.woots;
        totalGrabsPoints = songvotes[0].dataValues.totalgrabs * bot.global.pointsWeight.grabs;
      }

      if (!isNil(songVotesMehs[0])) {
        totalMehsPoints = songVotesMehs[0].dataValues.totalmehs * bot.global.pointsWeight.mehs;
      }

      const offlineDaysPoints = ((moment().diff(userDB.get("last_seen"), "days") * bot.global.pointsWeight.daysOffline) * 100) + 1;

      const points = propsGivenPoints + totalMessagesPoints + ((((totalWootsPoints + totalGrabsPoints) / (totalMehsPoints + 1)) - (offlineDaysPoints + totalbans)) * ((playscount / (totalsongs + playsmehcount)) * 100));

      const role = "485174834448564224"; //bot.guilds.get("485173051432894489").roles.find(r => r.name === "RDJ");

      if (isNaN(points)) {
        await bot.plug.moderateSetRole(id, ROOM_ROLE.NONE);
        return true;
      }

      if (isObject(user)) {
        if (user.role >= ROOM_ROLE.BOUNCER || user.gRole >= GLOBAL_ROLES.MODERATOR) return false;

        if (user.role === ROOM_ROLE.RESIDENTDJ) {
          const tolerance = 20;
          const userPoints = points + tolerance;

          if (((userPoints < 100 && playscount < 250) || (userPoints < 50 && playscount > 250)) || playscount < 150) {
            await bot.plug.moderateSetRole(user.id, ROOM_ROLE.NONE);

            if (!isNil(userDB.get("discord"))) {
              await bot.guilds.get("485173051432894489").members.get(userDB.get("discord")).removeRole(role).catch(console.error);
            }

            await bot.plug.sendChat(bot.utils.replace(bot.lang.rdjDemoted, {
              user: user.username
            }));
          }
        } else {
          const joined = moment().diff(userDB.get("created_at"), "months");

          if ((points >= 100 && joined >= 1 && playscount >= 150) || (points >= 50 && joined >= 1 && playscount >= 250)) {
            await bot.plug.moderateSetRole(user.id, ROOM_ROLE.RESIDENTDJ);

            if (!isNil(userDB.get("discord"))) {
              await bot.guilds.get("485173051432894489").members.get(userDB.get("discord")).addRole(role).catch(console.error);
            }

            await bot.plug.sendChat(bot.utils.replace(bot.lang.rdjPromoted, {
              user: user.username
            }));
          }
        }
      } else {
        bot.plug.getAllStaff(async (err, data) => {
          const offUser = data.filter(u => u.id === id);

          if (isNil(offUser[0])) return false;
          if (offUser[0].role >= ROOM_ROLE.BOUNCER || offUser[0].gRole >= GLOBAL_ROLES.MODERATOR) return false;

          if (offUser[0].role === ROOM_ROLE.RESIDENTDJ) {
            const tolerance = 20;
            const userPoints = points + tolerance;

            if (((userPoints < 100 && playscount < 250) || (userPoints < 50 && playscount > 250)) || playscount < 150) {
              await bot.plug.moderateSetRole(offUser[0].id, ROOM_ROLE.NONE);
  
              if (!isNil(userDB.get("discord"))) {
                await bot.guilds.get("485173051432894489").members.get(userDB.get("discord")).removeRole(role).catch(console.error);
              }
  
              await bot.plug.sendChat(bot.utils.replace(bot.lang.rdjDemoted, {
                user: offUser[0].username
              }));
            }
          } else {
            const joined = moment().diff(userDB.get("created_at"), "months");
  
            if ((points >= 100 && joined >= 1 && playscount >= 150) || (points >= 50 && joined >= 1 && playscount >= 250)) {
              await bot.plug.moderateSetRole(offUser[0].id, ROOM_ROLE.RESIDENTDJ);
  
              if (!isNil(userDB.get("discord"))) {
                await bot.guilds.get("485173051432894489").members.get(userDB.get("discord")).addRole(role).catch(console.error);
              }
  
              await bot.plug.sendChat(bot.utils.replace(bot.lang.rdjPromoted, {
                user: offUser[0].username
              }));
            }
          }
        });
      }

      return true;
    },
  };

  bot.utils.register(util);
};