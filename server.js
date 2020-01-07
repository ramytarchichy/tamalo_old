const express = require('express')
const session = require('cookie-session')
const bodyParser = require('body-parser')
const MongoClient = require('mongodb').MongoClient
const http = require('http')
const helmet = require('helmet')
const crypto = require('crypto')
const argon2 = require('argon2')
const io = require('socket.io')
const fs = require('fs')
const pug = require('pug')

//Objects
let app = express()
let options = JSON.parse(fs.readFileSync('options.json'))
let clientMap = new Map()
let games = new Map()
let mongoClient = new MongoClient(options.mongodb_url, { useUnifiedTopology: true })



function removePower(game, power)
{
    for (let i = 0; i < game.powers.length; ++i)
    {
        if (game.powers[i] === power)
        {
            game.powers.splice(i, 1)
            break
        }
    }
}

function dropCardOnDeck(game, weight)
{
    game.deck.push(game.topCard)
    game.topCard = weight
    game.droppable = true
}

function generateToken()
{
    return crypto.randomBytes(48).toString('base64')
}

function generateId()
{
    return crypto.randomBytes(16).toString('hex')
}

function findUserBySession(db, session)
{
    return db.collection('users').findOne({
        id: session.userId,
        tokens: {$elemMatch:{$eq:session.token}}
    })
}

function broadcastTo(clients, message, data)
{
    for (let i=0; i<clients.length; ++i)
    {
        clients[i].emit(message, data)
    }
}

function getPlayerIndexByUserId(game, userId)
{
    for(let i = 0; i < game.players.length; ++i)
    {
        if (game.players[i].userId == userId)
            return i
    }
}

function requireJoined(client, fun)
{
    const clientData = clientMap.get(client.id)
    if (!clientData) return
    if (!clientData.userId) return
    let game = games.get(clientData.gameId)
    if (!game) return

    fun(clientData, game)
}

function requirePower(client, power, fun)
{
    requireTurn(client, (clientData, game) =>
    {
        if (game.powers.includes(power))
        {
            fun(clientData, game)
        }
        else
        {
            client.emit('tamaloError', {
                error: 'NoPower'
            })
        }
    })
}

function getPlayerIndexByUserId(game, userId)
{
    for (let i = 0; i < game.players.length; ++i)
    {
        if (game.players[i].userId == userId)
            return i
    }
}

function requireTurn(client, fun)
{
    requireJoined(client, (clientData, game) =>
    {
        if (game.state === 'in-game')
        {
            if(game.players[game.playerTurnIndex].userId === clientData.userId)
            {
                fun(clientData, game)
            }
            else
            {
                client.emit('tamaloError', {
                    error: 'NotTurn'
                })
            }
        }
        else
        {
            client.emit('tamaloError', {
                error: 'NotInGame'
            })
        }
    })
}

function shuffle(array)
{
    let counter = array.length

    // While there are elements in the array
    while (counter > 0)
    {
        // Pick a random index
        let index = Math.floor(Math.random() * counter)

        // Decrease counter by 1
        counter--

        // And swap the last element with it
        let temp = array[counter]
        array[counter] = array[index]
        array[index] = temp
    }

    return array
}



//Mongo Client
mongoClient.connect(async (err) =>
{
    if (err)
        throw err;

    //Mongo Database
    const db = mongoClient.db(options.mongodb_name)

    //Session management
    app.use(session({
        name: 'session',
        keys: options.session_keys,
        maxAge: 1 * 12 * 30 * 24 * 60 * 60 * 1000
    }))
    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({extended: true}));


    //Requests


    app.get('/', async (req, res) =>
    {
        res.render('index', {
            user: await findUserBySession(db, req.session)
        })
    })

    app.get('/game', async (req, res) =>
    {
        //Make sure you're not joining a nonexistent game
        let id = req.query.id
        if (id == null)
        {
            return res.redirect('/')
        }

        //Make sure the user is logged in
        if (findUserBySession(db, req.session))
        {
            res.render('game', {
                user: await findUserBySession(db, req.session),
                session: req.session
            })
        }
        else
        {
            res.redirect('/login?redirect=' + encodeURIComponent('/game?id=' + id))
        }
    })


    app.get('/login', async (req, res) =>
    {
        //TODO: handle already logged in
        res.render('login')
    })

    app.post('/login', async (req, res) =>
    {
        //TODO: handle already logged in

        const redirect = req.query.redirect
        
        //Find user in DB
        let dbResult = await db.collection('users').findOne({username: req.body.username})

        if(dbResult == null)
        {
            return res.redirect('/login')
        }

        //TODO: handle other auth methods
        if(await argon2.verify(dbResult.auth.password, req.body.password))
        {
            //TODO: update hash

            //Create new token
            const token = generateToken()
            req.session.userId = dbResult.id
            req.session.token = token

            //Update DB
            await db.collection('users').updateOne(dbResult, {$set:
                {
                    tokens: dbResult.tokens.concat([token])
                }
            })

            return res.redirect('/')
        }

        return res.redirect('/login')
    })


    app.get('/logout', async (req, res) =>
    {
        const redirect = req.query.redirect//TODO: redirect

        //Remove token from database
        const user = findUserBySession(db, req.session)
        if (user)
        {
            await db.collection('users').updateOne(user, {
                $pull: {'tokens': req.session.token}
            })
        }

        //Delete cookie from browser
        req.session = null

        res.redirect('/')
    })


    app.get('/signup', async (req, res) =>
    {
        //TODO: handle already logged in

        res.render('signup', {
            user: await findUserBySession(db, req.session)
        })
    })

    app.post('/signup', async (req, res) =>
    {
        //TODO: handle already logged in

        if (req.body.username && req.body.password)
        {
            let a = await db.collection('users').find({username: req.body.username}).toArray()
            
            //Check if user already registered
            if (a.length != 0)
            {
                return res.render('signup', {
                    user: await findUserBySession(db, req.session),
                    error:
                    {
                        userTaken: true
                    }
                })
            }


            // Create user

            //Hash password
            const hash = await argon2.hash(req.body.password, {
                type: argon2.argon2id,
                timeCost: 10,
                memoryCost: 2 ** 16,
                parallelism: 1,
                hashLength: 48
            })

            //Create session token
            const token = generateToken()
            const userId = generateId()
            req.session.token = token
            req.session.userId = userId

            //Save everything in database
            await db.collection('users').insertOne(
            {
                username: req.body.username,
                id: userId,

                auth:
                {
                    method: 'password',
                    hash: 'argon2',
                    password: hash
                },

                tokens: [token]
            })

            res.redirect('/')
        }
        else
        {
            res.redirect('/')
        }
    })


    app.get('/account', async (req, res) =>
    {
        const user = await findUserBySession(db, req.session)

        if (user)
        {
            res.render('account', {
                user: await findUserBySession(db, req.session)
            })
        }
        else
        {
            res.redirect('/login')
        }
    })
    //TODO: hash token secrets

    app.get('/privacy', async (req, res) =>
    {
        res.render('privacy', {
            user: await findUserBySession(db, req.session)
        })
    })


    app.get('/new_game', async (req, res) =>
    {
        res.render('new_game', {
            user: await findUserBySession(db, req.session)
        })
    })

    app.post('/new_game', (req, res) =>
    {
        //Create game object
        const gameId = generateId()
        let game = {
            id: gameId,
            state: 'not-started',
            round: 0,
            topCard: null,
            droppable: false,
            drawable: true,
            drawn: null,
            powers: [],
            deck: [
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
            ],
            clients: [],
            players: [],
            playerTurnIndex: 0,
            playerStopIndex: null,
            loops: 0
        }
        
        //Add to games map
        games.set(gameId, game)

        res.redirect('/game?id=' + gameId)
    })


    //Express Middleware
    app.use(helmet())
    app.set('view engine', 'pug')
    app.locals.pretty = true;
    app.set('views', './views')
    app.use(express.static('public'))


    //Web server
    let server = http.createServer(app)

    //Socket.IO server
    io(server).on('connection', (client) => {

        client.on('join', async(data) =>
        {
            let game = games.get(data.gameId)

            //Check if the session cookie data is valid
            const user = await findUserBySession(db, data.session)
            if (!user)
            {
                return client.emit('tamaloError', {
                    error: 'InvalidLogin'
                })
            }

            //Check if game exists
            if (!game)
            {
                return client.emit('tamaloError', {
                    error: 'NoSuchGame'
                })
            }

            //A socket.io client can only join a single game at a time
            if (clientMap.has(client.id))
            {
                return client.emit('tamaloError', {
                    error: 'AlreadyJoinedSocket'
                })
            }

            //TODO:Check if player joined game twice
            

            clientMap.set(client.id, {
                gameId: data.gameId,
                userId: data.session.userId,
                token: data.session.token
            })

            game.clients.push(client)

            game.players.push({
                userId: user.id,
                cards: [],
                score: 0,
                wonRounds: 0
            })

            broadcastTo(game.clients, 'playerJoined', {
                index: game.players.length,
                userId: user.id
            })

            client.emit('joined', true)
        })

        client.on('voteReady', (data) =>
        {
            requireJoined(client, (clientData, game) =>
            {
                game.state = 'in-game'
                //TODO check if game in progress

                game.playerTurnIndex = 0
                game.playerStopIndex = null
                game.loops = 0
                game.topCard = null
                game.droppable = false
                game.drawable = true
                game.drawn = null

                game.deck = [
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

                //Shuffle deck
                shuffle(game.deck)

                //Give everyone cards
                for (let i = 0; i < game.players.length; ++i)
                {
                    let player = game.players[i]
                    player.cards=[]

                    //Take 4 cards
                    for (let j = 0; j < 4; ++j)
                    {
                        player.cards.push({
                            weight: game.deck.splice(0, 1)[0],
                            seenBy: []
                        })
                    }

                    //Show 2 cards
                    for(let j = 0; j < 2; ++j)
                    {
                        player.cards[j].seenBy.push(player.userId)
                    }
                }

                broadcastTo(game.clients, 'gameStateChanged', game.state)
            })
            //TODO: democracy
            
        })

        client.on('disconnect', () =>
        {
            const data = clientMap.get(client.id)

            if (!data) return

            const wasJoined = clientMap.delete(client.id)
            let game = games.get(data.gameId)

            if (wasJoined && game != undefined)
            {
                //Delete client
                game.clients.splice(game.clients.indexOf(client.id), 1)

                //Player
                for(let i = 0; i < game.players.length; ++i)
                {
                    let player = game.players[i]

                    if (player.userId === data.userId)
                    {
                        //Put cards back in deck
                        for (let j = 0; j < player.cards.length; ++j)
                        {
                            game.deck.push(player.cards[j].weight)
                        }

                        //Delete player
                        game.players.splice(i, 1)

                        //Adjust player turn index
                        if (i === game.players.length-1)
                        {
                            game.playerTurnIndex = 0
                            game.loops++
                        }
                        else if (i < game.playerTurnIndex)
                        {
                            game.playerTurnIndex--
                        }

                        //If player stopped, unstop
                        if (game.playerStopIndex === i)
                            game.playerStopIndex = null

                        //Adjust player stop index
                        if (i < game.playerStopIndex)
                        {
                            game.playerStopIndex--
                        }
                    }
                    else
                    {
                        //Remove user ID from cards
                        for (let j = 0; j < player.cards.length; ++j)
                        {
                            let seenBy = player.cards[j].seenBy
                            for (let k = 0; k < seenBy.length; ++k)
                            {
                                if (seenBy[k] === data.userId)
                                {
                                    seenBy.splice(i, 1)
                                }
                            }
                        }
                    }
                }

                //Broadcast event
                broadcastTo(game.clients, 'playerQuit', {
                    userId: data.userId
                })
            }
        })

        client.on('drawCard', (data) =>
        {
            requireTurn(client, (clientData, game) =>
            {
                if (game.drawable)
                {
                    const card = game.deck.splice(0, 1)[0]

                    game.drawable = false
                    game.drawn = card

                    broadcastTo(game.clients, 'playerDrawnCard', {
                        userId: clientData.userId
                    })

                    client.emit('drawnCard', {
                        card: card
                    })
                }
                else
                {
                    client.emit('tamaloError', {
                        error: 'CannotDraw'
                    })
                }
            })
        })

        client.on('dropCard', (data) =>
        {
            requireJoined(client, (clientData, game) =>
            {
                if (game.droppable)
                {
                    //TODO: make sure the indices are within bounds

                    let player = game.players[getPlayerIndexByUserId(game, clientData.userId)]
                    let card = player.cards[data.index]

                    let success =
                        game.topCard === card.weight ||
                        ((game.topCard === 0) && (card.weight === 13)) ||
                        ((game.topCard === 13) && (card.weight === 0))

                    if (success)
                    {
                        //Drop card
                        dropCardOnDeck(game, card.weight)
                        player.cards.splice(data.index, 1)

                        game.droppable = false
                    }
                    else
                    {
                        //Card is seen by everyone
                        for (let i = 0; i < game.players.length; ++i)
                        {
                            let userId = game.players[i].userId
                            if (!card.seenBy.includes(userId))
                                card.seenBy.push(userId)
                        }

                        //Give penalty
                        player.cards.push({
                            weight: game.deck.splice(0, 1)[0],
                            seenBy: []
                        })
                    }

                    //Broadcast event
                    broadcastTo(game.clients, 'playerDroppedCard', {
                        index: data.index,
                        value: card.weight,
                        success: success
                    })
                }
                else
                {
                    client.emit('tamaloError', {
                        error: 'NotDroppable'
                    })
                }
            })
        })

        client.on('dropDrawn', () =>
        {
            requireTurn(client, (clientData, game) =>
            {
                //Make sure the player has drawn a card before dropping it
                if (game.drawn === null)
                {
                    client.emit('tamaloError', {
                        error: 'NotDrawn'
                    })

                    return
                }

                //Give powers, if any are granted by that card
                switch(game.drawn)
                {
                    case 7:
                    case 8:
                        game.powers.push('viewSelf')
                        break

                    case 9:
                    case 10:
                        game.powers.push('viewOther')
                        break

                    case 11:
                    case 12:
                        game.powers.push('swapOther')
                        break

                    case 0:
                    case 13:
                        game.powers.push('viewOther')
                        game.powers.push('swapOther')
                        break
                }

                //Drop card on stack
                dropCardOnDeck(game, game.drawn)
                game.drawn = null

                //Broadcast event
                broadcastTo(game.clients, 'playerDroppedDrawn', {
                    card: game.topCard
                })
            })
        })

        client.on('swapDrawn', (data) =>
        {
            requireTurn(client, (clientData, game) =>
            {
                //Make sure the player has drawn a card before swapping it
                if (game.drawn === null)
                {
                    client.emit('tamaloError', {
                        error: 'NotDrawn'
                    })

                    return
                }

                //Make sure the card he's swapping it with exists
                //TODO

                //Swap cards
                let player
                for (let i = 0; i < game.players.length; ++i)
                {
                    let p = game.players[i]
                    if (p.userId === clientData.userId)
                    {
                        player = p
                        break
                    }
                }
                dropCardOnDeck(game, player.cards[data.index].weight)
                player.cards[data.index].weight = game.drawn
                player.cards[data.index].seenBy = [player.userId]

                game.drawn = null

                //Broadcast event
                broadcastTo(game.clients, 'playerSwappedDrawn', {
                    index: data.index,
                    card: game.topCard
                })
            })
        })

        client.on('viewSelf', (data) =>
        {
            requirePower(client, 'viewSelf', (clientData, game) =>
            {
                //TODO: make sure card exists

                let player = game.players[getPlayerIndexByUserId(game, clientData.userId)]
                player.cards[data.index].seenBy.push(player.userId)

                //Remove power
                removePower(game, 'viewSelf')

                //Broadcast Event
                broadcastTo(game.clients, 'playerViewSelf', {
                    index: data.index
                })
            })
        })

        client.on('viewOther', (data) =>
        {
            //TODO: remove power once used
            requirePower(client, 'viewOther', (clientData, game) =>
            {
                //TODO: make sure card and player exist

                game.players[data.player].cards[data.card].seenBy.push(clientData.userId)

                //Remove power
                removePower(game, 'viewOther')

                //Broadcast Event
                broadcastTo(game.clients, 'playerViewOther', {
                    player: data.player,
                    card: data.card
                })
            })
        })

        client.on('swapOther', (data) =>
        {
            requirePower(client, 'swapOther', (clientData, game) =>
            {
                //Check if stopped
                if (game.playerStopIndex === data.otherPlayerIndex)
                {
                    client.emit('tamaloError', {
                        error: 'PlayerStopped'
                    })

                    return
                }

                //Check if player exists
                if (!(0 <= data.otherPlayerIndex && data.otherPlayerIndex < game.players.length))
                {
                    client.emit('tamaloError', {
                        error: 'IndexOutOfBounds'
                    })

                    return
                }

                //TODO: same check for cards

                //Swap cards (yes, ES6 has a cool thing you can youse but it would be too long and unreadable here)
                const tmp = game.players[game.playerTurnIndex].cards[data.cardIndex]
                game.players[game.playerTurnIndex].cards[data.cardIndex] = game.players[data.otherPlayerIndex].cards[data.otherCardIndex]
                game.players[data.otherPlayerIndex].cards[data.otherCardIndex] = tmp

                //Remove power
                removePower(game, 'swapOther')

                //Broadcast event
                broadcastTo(game.clients, 'playerSwapOther', {
                    cardIndex: data.cardIndex,
                    otherPlayerIndex: data.otherPlayerIndex,
                    otherCardIndex: data.otherCardIndex
                })
            })
        })

        client.on('nextPlayer', (data) =>
        {
            requireTurn(client, (clientData, game) =>
            {
                if (game.drawn === null && !game.drawable)
                {
                    //Reset game stuff
                    game.powers = []
                    game.drawable = true

                    //Next Player
                    game.playerTurnIndex += 1
                    game.playerTurnIndex %= game.players.length

                    if (game.playerTurnIndex === 0)
                    {
                        ++game.loops
                    }

                    //If player stopped
                    if (game.playerStopIndex === game.playerTurnIndex)
                    {
                        game.state = 'round-end'
                        game.loops = 0
                        game.round++
                        
                        //Check how many points the player accumulated
                        let stopPoints = 0
                        let playerStop = game.players[game.playerStopIndex]
                        for (let i = 0; i < playerStop.cards.length; ++i)
                        {
                            stopPoints += playerStop.cards[i].weight
                        }

                        //Get all points
                        let points = []
                        for (let i = 0; i < game.players.length; ++i)
                        {
                            let player = game.players[i]
                            points.push(0)
                            for (let j = 0; j < player.cards.length; ++j)
                            {
                                points[i] += player.cards[j].weight
                            }
                        }

                        //Find out who won
                        let won = true
                        for (let i = 0; i < game.players.length; ++i)
                        {
                            let player = game.players[i]

                            if (i === game.playerStopIndex) continue
                            
                            if (points[i] <= stopPoints)
                            {
                                won = false
                            }
                        }

                        //Update data
                        for (let i = 0; i < game.players.length; ++i)
                        {
                            let player = game.players[i]
                            if (i === game.playerStopIndex)
                            {
                                if (won)
                                {
                                    player.score += 10
                                    continue
                                }
                                else
                                {
                                    player.score -= 10
                                }
                            }

                            player.score -= points[i]
                        }

                        broadcastTo(game.clients, 'gameStateChanged', game.state)

                        return
                    }

                    broadcastTo(game.clients, 'nextPlayer', {
                        index: game.playerTurnIndex
                    })
                }
                else
                {
                    client.emit('tamaloError', {
                        error: 'MustDraw'
                    })
                }
            })
        })

        client.on('callStop', (data) =>
        {
            requireTurn(client, (clientData, game) =>
            {
                //TODO: make it configurable
                if (game.loops >= 3 && game.playerStopIndex === null)
                {
                    for (let i = 0; i < game.players.length; ++i)
                    {
                        if (game.players[i].userId === clientData.userId)
                        {
                            game.playerStopIndex = i
                            break
                        }
                    }

                    broadcastTo(game.clients, 'callStop', {
                        index: game.playerStopIndex
                    })
                }//TODO: send errors
            })
        })
        //TODO: number.issafeinteger() everywhere
        client.on('syncData', (data) =>
        {
            requireJoined(client, async (clientData, game) =>
            {
                //Game Data
                let gameData = {
                    state: game.state,
                    round: game.round,
                    loops: game.loops,
                    droppable: game.droppable,
                    drawable: game.drawable,
                    topCard: game.topCard,
                    playerTurn: game.playerTurnIndex,
                    playerStop: game.playerStopIndex,
                    players: [],
                    powers: game.powers,
                    isCardDrawn: game.drawn !== null
                }
                
                //Self
                for(let i = 0; i < game.players.length; ++i)
                {
                    if (game.players[i].userId === clientData.userId)
                    {
                        gameData.self = i

                        break
                    }
                }

                //Drawn card (only send if current player is requesting it)
                for(let i = 0; i < game.players.length; ++i)
                {
                    if (game.players[i].userId === clientData.userId)
                    {
                        if (i === game.playerTurnIndex)
                        {
                            gameData.drawn = game.drawn
                        }
                        else
                        {
                            gameData.drawn = null
                        }

                        break
                    }
                }

                //Players
                for(let i = 0; i < game.players.length; ++i)
                {
                    let player = {
                        userId: game.players[i].userId,
                        score: game.players[i].score,
                        wonRounds: game.players[i].wonRounds,
                        cards: []
                    }

                    //Cards
                    for(let j = 0; j < game.players[i].cards.length; ++j)
                    {
                        let card = {
                            seenBy: game.players[i].cards[j].seenBy,
                            weight: null
                        }

                        //If player has seen this card
                        if (card.seenBy.includes(clientData.userId))
                        {
                            card.weight = game.players[i].cards[j].weight
                        }

                        player.cards.push(card)
                    }

                    gameData.players.push(player)
                }

                //Usernames
                for (let i = 0; i < game.players.length; ++i)
                {
                    const user = await db.collection('users').findOne({
                        id: game.players[i].userId
                    })

                    //Check if null TODO

                    gameData.players[i].username = user.username
                }

                client.emit('syncData', gameData)
            })
        })

    })


    //Run server
    let listener = server.listen(options.port, () =>
    {
        console.log('Server running on port ' + listener.address().port)
    })
})
