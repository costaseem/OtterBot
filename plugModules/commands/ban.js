const { isObject, isEmpty } = require("lodash");
const { ROOM_ROLE, GLOBAL_ROLES } = require("plugapi");
const Discord = require("discord.js");

module.exports = function Command(bot) {
  bot.plugCommands.register({
    names: ["ban"],
    minimumPermission: 2000,
    cooldownType: "none",
    cooldownDuration: 0,
    parameters: "<@username> [hour|h|d|day|p|perma] <reason>",
    description: "Bans the specified user for the specified duration from the community.",
    async execute(rawData, { args, name }, lang) { // eslint-disable-line no-unused-vars
      if (!rawData.mentions.length || rawData.mentions.length >= 2) {
        this.reply(lang.invalidUser, {}, 6e4);
        return false;
      }

      const user = rawData.mentions[0];
      
      if (!isObject(user)) {
        this.reply(lang.userNotFound, {}, 6e4);
        return false;
      } else if (user.id === rawData.from.id) {
        this.reply(lang.moderation.onSelf, { command: `!${name}` }, 6e4);
        return false;
      } else if ((user.role >= ROOM_ROLE.BOUNCER && rawData.from.role <= ROOM_ROLE.MANAGER) || user.gRole >= GLOBAL_ROLES.MODERATOR) {
        this.reply(lang.moderation.onStaff, {}, 6e4);
        return false;
      }

      const durationArgs = rawData.args.slice(1).shift();
      let apiDuration;
      let timeSelected = true;
      let reason;

      switch (durationArgs) {
        case "hour":
        case "h":
          apiDuration = bot.plug.BAN.HOUR;
          break;
        case "day":
        case "d":
          apiDuration = bot.plug.BAN.DAY;
          break;
        case "perma":
        case "p":
          apiDuration = bot.plug.BAN.PERMA;
          break;
        default:
          apiDuration = bot.plug.BAN.HOUR;
          timeSelected = false;
          break;
      }

      if (timeSelected) {
        reason = rawData.args.slice(2).join(" ");
      }
      else
      {
        reason = rawData.args.slice(1).join(" ");
      }

      if (isEmpty(reason)) {
        this.reply(lang.moderation.needReason, {}, 6e4);
        return false;
      }

      const embed = new Discord.RichEmbed()
        //.setTitle("Title")
        .setAuthor(user.username, "http://icons.iconarchive.com/icons/paomedia/small-n-flat/64/sign-ban-icon.png")
        .setColor(0xFF00FF)
        //.setDescription("This is the main body of text, it can hold 2048 characters.")
        .setFooter("By " + rawData.from.username)
        //.setImage("http://i.imgur.com/yVpymuV.png")
        //.setThumbnail("http://i.imgur.com/p2qNFag.png")
        .setTimestamp()
        //.addField("This is a field title, it can hold 256 characters")
        .addField("ID", user.id, true)
        .addField("Type", "Ban", true)
        .addField("Time", apiDuration, true)
        .addField("Reason", reason, false);
      //.addBlankField(true);

      bot.channels.get("485173444330258454").send({embed});
      bot.channels.get("486637288923725824").send({embed});

      await bot.plug.moderateBanUser(user.id, bot.plug.BAN_REASON.NEGATAIVE_ATTITUDE, apiDuration);
      this.reply(lang.moderation.effective, {
        mod: rawData.from.username,
        command: `!${name}`,
        user: user.username,
      });
      return true;
    },
  });
};