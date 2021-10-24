export default class Game
{
    constructor()
    {
        this.clients = []
        this.players = []

        this.newRound()

        this.round = 0
        this.state = 'not-started'
    }

    newRound()
    {
        this.round++
        this.loops = 0
        this.droppable = true
        this.topCard = null

        this.playerTurn = 0
        this.playerStopped = null

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

        _shuffleDeck()
        shuffle(this.players)

        for (let i = 0; i < this.players.length; ++i)
        {
            let player = this.players[i]
            
        }

        this.state = 'in-game'
    }

    nextPlayer()
    {
        this.playerTurn++
        this.playerTurn %= this.players.length

        if (this.playerTurnIndex === 0)
        {
            this.loops++
        }
    }

    _pushCard(weight)
    {
        this.deck.push(this.topCard)
        this.topCard = weight

        this._cardsPushed++
        if (this._cardsPushed >= )
            this._shuffleDeck
    }

    _shuffleDeck()
    {
        this._cardsPushed = 0
        shuffle(this.deck)
    }

    _drawCard()
    {
        return this.deck.splice(0, 1)
    }
}
