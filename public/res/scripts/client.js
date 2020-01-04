let socket = io.connect(window.location.protocol + '//' + window.location.hostname + ':' + window.location.port + '/')

const urlParams = new URLSearchParams(window.location.search)
const gameID = urlParams.get('id')

const divJoin = document.getElementById('join')
const divGame = document.getElementById('game')
const divControls = document.getElementById('controls')
const divDrawn = document.getElementById('drawnCard')
const txtDrawnWeight = document.getElementById('drawnCardWeight')
const playerTable = document.getElementById('playerList')
const divPlayers = document.getElementById('players')

const btnViewSelf = document.getElementById('btnViewSelf')
const btnViewOther = document.getElementById('btnViewOther')
const btnSwapOther = document.getElementById('btnSwapOther')
const btnDraw = document.getElementById('btnDraw')
const btnNext = document.getElementById('btnNext')
const btnDrop = document.getElementById('btnDrop')

const txtTopCard = document.getElementById('topCard')

const screens = [
    divJoin, divGame
]

let myCardButtons = []
let playerCardButtons = []

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
    socket.emit('syncData', {})
})

socket.on('playerQuit', (data) =>
{
    socket.emit('syncData', {})
})

socket.on('gameStateChanged', (data) =>
{
    socket.emit('syncData', {})
})

socket.on('callStop', () =>
{
    socket.emit('syncData', {})
})

socket.on('syncData', (data) =>
{
    game = data
    console.log(data)
    updateUI()
})

socket.on('tamaloError', (data) =>
{
    socket.emit('syncData', {})
    console.log(data.error)
})

socket.on('drawnCard', (data) =>
{
    socket.emit('syncData', {})
})

socket.on('nextPlayer', (data) =>
{
    socket.emit('syncData', {})
})

socket.on('playerDroppedCard', (data) =>
{
    socket.emit('syncData', {})
})

socket.on('playerDroppedDrawn', (data) =>
{
    socket.emit('syncData', {})
})

socket.on('playerSwappedDrawn', (data) =>
{
    socket.emit('syncData', {})
})

socket.on('playerViewSelf', (data) =>
{
    socket.emit('syncData', {})
})

socket.on('playerViewOther', (data) =>
{
    socket.emit('syncData', {})
})

socket.on('playerSwapOther', (data) =>
{
    socket.emit('syncData', {})
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

    //Drawn card
    //TODO: show if other player takes card
    if (game.isCardDrawn === true && game.drawnCard !== null)
    {
        divDrawn.style.display = game.isCardDrawn ? 'block' : 'none'
        txtDrawnWeight.innerHTML = game.drawn
    }

    //Player list
    switch(game.state)
    {
        //TODO: other states

        case 'not-started':
            //TODO
            break

        case 'in-game':

            txtTopCard.innerHTML = 'Top card: ' +  game.topCard

            //Controls
            divControls.style.display = (game.self === game.playerTurn)?'block':'none'
            btnDraw.disabled = !game.drawable
            btnNext.disabled = game.drawable || game.isCardDrawn
            btnViewSelf.disabled = !game.powers.includes('viewSelf')
            btnViewOther.disabled = !game.powers.includes('viewOther')
            btnSwapOther.disabled = !game.powers.includes('swapOther')
            btnCallStop.disabled = game.loops < 3 || game.playerStop !== null
            btnDrop.disabled = !game.droppable || game.topCard === null

            //Players
            divPlayers.innerHTML = ''
            myCardButtons = []
            playerCardButtons = []

            for (let i = 0; i < game.players.length; ++i)
            {
                let player = game.players[i]
                playerCardButtons.push([])

                let li = document.createElement('li')
                
                li.innerHTML += he.encode(player.username)

                //Cards
                for (let j = 0; j < player.cards.length; ++j)
                {
                    let card = player.cards[j]

                    let btn = document.createElement('button')
                    if (card.weight === null)
                    {
                        btn.innerHTML = '???'
                    }
                    else
                    {
                        btn.innerHTML = card.weight
                    }
                    btn.disabled = true

                    li.appendChild(btn)

                    playerCardButtons[i].push(btn)

                    if (i === game.self)
                    {
                        myCardButtons.push(btn)
                    }
                }

                divPlayers.appendChild(li)
            }
            break
    }

    //Self

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

function dropDrawn()
{
    socket.emit('dropDrawn', {})
    divDrawn.style.display = 'none'
}

function selectSwapDrawn()
{
    //Enable buttons
    for (let i = 0; i < myCardButtons.length; ++i)
    {
        let btn = myCardButtons[i]
        btn.disabled = false
        btn.onclick = ()=>{swapDrawn(i)}
    }

    //Hide popup
    divDrawn.style.display = 'none'
}

function swapDrawn(index)
{
    socket.emit('swapDrawn', {
        index: index
    })
}

function powerViewSelf()
{
    for (let i = 0; i < myCardButtons.length; ++i)
    {
        let btn = myCardButtons[i]

        btn.disabled = false
        btn.onclick = () => {viewSelf(i)}
    }
}

function viewSelf(index)
{
    socket.emit('viewSelf', {
        index: index
    })
}

function powerViewOther()
{
    for (let i = 0; i < playerCardButtons.length; ++i)
    {
        for (let j = 0; j < playerCardButtons[i].length; ++j)
        {
            let btn = playerCardButtons[i][j]

            btn.disabled = false
            btn.onclick = () => {viewOther(i, j)}
        }
    }
}
//TODO: stop not working
function viewOther(playerIndex, cardIndex)
{
    socket.emit('viewOther', {
        player: playerIndex,
        card, cardIndex
    })
}

function powerSwapOther()
{
    for (let i = 0; i < myCardButtons.length; ++i)
    {
        let btn = myCardButtons[i]

        btn.disabled = false
        btn.onclick = () => {selectSwap(i)}
    }
}

let selectedSwap
function selectSwap(index)
{
    selectedSwap = index

    for (let i = 0; i < myCardButtons.length; ++i)
    {
        let btn = myCardButtons[i]
        btn.disabled = true
    }

    for (let i = 0; i < playerCardButtons.length; ++i)
    {
        for (let j = 0; j < playerCardButtons[i].length; ++j)
        {
            let btn = playerCardButtons[i][j]

            btn.disabled = false
            btn.onclick = () => {swapOther(selectedSwap, i, j)}
        }
    }
}

function swapOther(myCard, otherPlayer, otherCard)
{
    socket.emit('swapOther', {
        cardIndex: myCard,
        otherPlayerIndex: otherPlayer,
        otherCardIndex: otherCard
    })
}

function clickDrop()
{
    for (let i = 0; i < myCardButtons.length; ++i)
    {
        let btn = myCardButtons[i]

        btn.disabled = false
        btn.onclick = () => {dropCard(i)}
    }
}

function dropCard(index)
{
    socket.emit('dropCard', {
        index: index
    })
}
