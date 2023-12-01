const {Reaction} = require('whatsapp-web.js/src/structures');

class ReactionCDC extends Reaction {
    constructor(reaction) {
        super(reaction.client, ReactionCDC.getData(reaction));
    }
    
    /**
     * Returns the Chat this message was sent in
     * @returns {Promise<Chat>}
     */
    async getChat() {
        return await this.client.getChatById((await this.getMessage())._getChatId());
    }
    
    async getMessage() {
        return await this.client.getMessageById(this.msgId._serialized).then(msg => {
            return msg;
        })
    }
    
    static getData(reaction) {
        return {
            msgKey: reaction.id,
            orphan: reaction.orphan,
            orphanReason: reaction.orphanReason,
            timestamp: reaction.timestamp,
            reactionText: reaction.reaction,
            read: reaction.read,
            parentMsgKey: reaction.msgId,
            senderUserJid: reaction.senderId,
            ack: reaction.ack,
        };
    }
}

module.exports = ReactionCDC;