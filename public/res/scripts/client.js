let socket = io.connect(window.location.protocol + '//' + window.location.hostname + ':' + window.location.port + '/')

const urlParams = new URLSearchParams(window.location.search)
const gameID = urlParams.get('id')

const divJoin = document.getElementById('join')
const divGame = document.getElementById('game')
const divDrawn = document.getElementById('drawnCard')
const playerTable = document.getElementById('playerList')

const screens = [
    divJoin, divGame
]

let joined = false
let game = null
let gameSettings = null

socket.on('connect', (data) =>
{
    //Tell the server to join this game
    socket.emit('join', {
        gameId: gameID,
        session: session
    })
})

socket.on('joined', (data) =>
{
    joined = data

    if (joined)
    {
        //Request game data
        socket.emit('syncData', {})
        socket.emit('getSettings', {})
    }
})

socket.on('playerJoined', (data) =>
{
    if (data.userId === session.userId) return
    socket.emit('syncData', {})
    //TODO
})

socket.on('playerQuit', (data) =>
{
    //I know this is garbage
    for(i=0; i<game.players.length; ++i)
    {
        if (game.players[i].userId == data.userId)
        {
            game.players.splice(i, 1)
        }
    }

    //TODO: update interface
})

socket.on('gameStateChanged', (data) =>
{
    game.state = data
    updateUI()
})

socket.on('syncData', (data) =>
{
    game = data
    document.getElementById('debug').innerText = JSON.stringify(data)
    updateUI()
})

socket.on('tamaloError', (data) =>
{
    socket.emit('syncData', {})
    console.log(data.error)
})

socket.on('drawnCard', (data) =>
{
    divDrawn.style.display = 'block'
})

socket.on('nextPlayer', (data) =>
{
    game.playerTurn += 1
    game.playerTurn %= game.players.length

    if (game.playerTurn === 0)
    {
        game.loops += 3
    }
})

socket.on('playerDroppedCard', (data) =>
{
    
})

socket.on('playerDroppedDrawn', (data) =>
{
    
})

socket.on('playerSwappedDrawn', (data) =>
{
    
})


function updateUI()
{
    //Hide all screens
    for(let i = 0; i < screens.length; ++i)
    {
        screens[i].style.display = 'none';
    }

    //Show only current screen
    let div
    switch(game.state)
    {
        //TODO: other states

        case 'not-started':
            div = divJoin
            break;

        case 'in-game':
            div = divGame
            break;
    }
    div.style.display = 'block'

    //Player list
    switch(game.state)
    {
        //TODO: other states

        case 'not-started':
            
            break

        case 'in-game':

            break
    }
}

function startGame()
{
    socket.emit('voteReady', {
        //TODO: boolean isready
    })
}

function nextPlayer()
{
    socket.emit('nextPlayer', {})
}

function drawCard()
{
    socket.emit('drawCard', {})
}

function callStop()
{
    socket.emit('callStop', {})
}
