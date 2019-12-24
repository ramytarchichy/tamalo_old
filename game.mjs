export default class Game
{
    constructor()
    {
        this.round = 0
        this.clients = []
        this.players = []

        this.newRound()
    }

    newRound()
    {
        this.round++
        this.loops = 0
        this.droppable = true

        this.playerTurnIndex = 0

        this.deck = [
            0, 0,
            1, 1, 1, 1,
            2, 2, 2, 2,
            3, 3, 3, 3,
            4, 4, 4, 4,
            5, 5, 5, 5,
            6, 6, 6, 6,
            7, 7, 7, 7,
            8, 8, 8, 8,
            9, 9, 9, 9,
            10, 10, 10, 10,
            11, 11, 11, 11,
            12, 12, 12, 12,
            13, 13
        ]
    }

    nextPlayer()
    {
        this.playerTurnIndex++
        this.playerTurnIndex %= this.players.length

        if (this.playerTurnIndex === 0)
            this.loops++
    }
}