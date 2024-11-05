import {io} from "https://cdn.socket.io/4.8.0/socket.io.esm.min.js";
//import {io} from "/socket.js";
const CON = $("#content");
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
genSesKey();
console.log(sessionStorage.getItem("SESSIONID"));
const socket = io('http://localhost:3000', {
    auth:{
        token: sessionStorage.getItem("SESSIONID")
    }
});

let PAGES;
await fetch('http://localhost:8000/pages.json')
    .then((response) => response.json())
    .then((json) => PAGES = json);
console.log(PAGES);
socket.on("connect", () => {
    console.log(`You connected with id ${socket.id}`);
})

function genSesKey(){
    if(sessionStorage.getItem("SESSIONID") === null) {
        const chars = "abcdefghijklmnoprstquvwxyzABCDEFGHIJKLMNOPRSTQUVWXYZ0123456789!@#$%^&*()_-+=";
        let S = "";
        for (let i = 0; i < 32; i++) {
            S += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        sessionStorage.setItem("SESSIONID", S);
        return S;
    }
    else return sessionStorage.getItem("SESSIONID");
}

let roomID;
let isHost = false;
socket.on('menu', async ()=>{
    $("#leave-room").hide();
    await loadCON("menu");
    //host join
    $("#create-game").click(async ()=>{
        await loadCON("host-login")
        $("#login").click(async()=>{
            console.log($("#playerName").val());
            socket.emit('newroom', $("#playerName").val(),async (callback)=>{
                //roomID=callback;
                console.log(callback);
                await loadCON("host-queue");
                socket.emit('getplayers');
                $("#leave-room").show();
                $("#gamecode").text(`Podaj znajomym kod ${callback}`);
                $("#foot").text(`Pokój: ${callback}`);
                isHost = true;
                $("#start-game").click(()=>{
                    socket.emit('startrequest');
                })
            })
        });
    });

    //guest join
    $("#join-game").click(async ()=>{
        await loadCON("guest-login")
        $("#login").click(()=>{
            socket.emit('joinroom', $("#playerName").val(), $("#gameID").val(), async (callback)=>{
                if(callback) {
                    $("#leave-room").show();
                    let roomID = $("#gameID").val();
                    await loadCON("guest-queue");
                    socket.emit('getplayers');
                    $("#gamecode").text(`Kod gry: ${roomID}`);
                    $("#foot").text(`Pokój: ${roomID}`);
                    location.reload();
                }
                else{
                    alert("Błędny kod");
                }
            });
        });
    });
})

socket.on('queue', async (ROOM)=>{
    $("#leave-room").show();
    if(isHost){
        await loadCON("host-queue");
        socket.emit('getplayers');
        $("#gamecode").text(`Podaj znajomym kod ${ROOM}`);
        $("#foot").text(`Pokój: ${ROOM}`);
        isHost = true;
        $("#start-game").click(()=>{
            socket.emit('startrequest');
        })
    }
    else{
        await loadCON("guest-queue");
        socket.emit('getplayers');
        $("#gamecode").text(`Kod gry: ${ROOM}`);
        $("#foot").text(`Pokój: ${ROOM}`);
    }
})





/*socket.on('restore', async (host) =>{
    isHost = host;
    if(!isHost) $("#content").html("<h1>Czekaj na następne pytanie!</h1>");
    else{
        //$("#content").html("<h1>Czekaj na koniec głosowania!</h1>");
        $("#content").html(`<button class="button1" id="continue">Następne pytanie</button>`);
        await delay(100);
        $("#continue").click(()=>{
            socket.emit('continue');
        });
    }
})*/

socket.on('players-update', (players)=>{
    let S = "";
    for(let i = 0; i < players.length; i++){
        S+=`<div class="player-frame"><h2 class="noslide">${players[i]}</h2>`;
        if(isHost && i>0)S+=`<button class="button-none kick noslide" id="kick${i}">
<img src="media/close.png" alt="close" width="20" class="noslide"></button>`;
        S+=`</div>`
    }
    $("#queue-players").html(S);
    for(let i = 0; i < players.length; i++) {
        $(`#kick${i}`).click(()=>{
            socket.emit('kick', `${i.toString()}`);
        });
    }
});

//kicked
socket.on('kickinfo', ()=>{
    sessionStorage.clear();
    location.reload();
})

socket.on('host', (c)=>{
    isHost = c === 'true';
})

socket.on('awaitresults', async ()=>{
    await loadCON("await-results");
})


socket.on('time', (k)=>{
    $("#timer-bar").css('width', `${k}%`);
});

socket.on('setfoot', (id)=>{
    $("#foot").text(`Pokój: ${id}`);
})

//GAME
socket.on('question',async(question, players) => {
    $("#leave-room").show();
    //socket.off('players-update');
    await loadCON("voting");
    $("#timer-frame").show();
    $("#question").text(question);
    $("#players").html(renderRadios(players));
    $("#confirm").click(()=>{
        const vote = parseInt($("input[name='RADIO']:checked").val());
        if(Number.isInteger(vote) && vote >= 0 && vote <= players.length) {
            loadCON("await-results");
            console.log(vote);
            socket.emit('vote', vote);
            //socket.emit('response', $("input[name='RADIO']:checked").val());
            //CON.html(`<h1>Twój głos: ${players[$('input[name="RADIO"]:checked').val()]}</h1><h1>Czekaj na wyniki!</h1>`);
        }
        else
            alert("Wybierz kogoś!");
    });
});

socket.on('results', (results)=>{
    $("#leave-room").show();
    $("#timer-frame").hide();
    console.log(results);
    $("#content").html(renderResults(results));
    $("#continue").click(()=>{
        socket.emit('continue');
    });
    $("#endgame").click(async ()=>{
        if(confirm("Na pewno chcesz zakończyć grę?")) {
            socket.emit('endgame');
        }
    })
})

$("#leave-room").click(()=>{
    if(!isHost) {
        if (confirm("Na pewno chcesz wyjść?"))
            socket.emit('kick', -1);
    }
    else
        alert("Jesteś hostem, aby wyjść zakończ grę!");
});

async function loadCON2(file){
    return new Promise(async (resolve) => {
        CON.load(`shards/${file}`, ()=>{
            resolve();
        });
    });
}

async function loadCON(file){
    return new Promise(async (resolve) => {
        await CON.html(PAGES[file]);
        //console.log(PAGES[file]);
        resolve();
    });
}

function renderRadios(players){
    let S="";
    for(let i = 0; i < players.length; i++){
        S+=`<input id="${i}" name="RADIO" value="${i}" type="radio" class="none"><label for="${i}" class="RADIO  noslide">${players[i]}</label>`;
    }
    return S;
}

function renderResults(results){
    let S="<h1>Wyniki</h1><div id='results'>";
    for(let i = 0; i < Object.keys(results).length; i++){
        S+=`<div><h2>${Object.keys(results)[i]}: ${Object.values(results)[i]}</h2></div>`;
    }
    S+=`</div>`
    if(isHost)S+=`<button class="button1" id="continue">Następne</button>
    <button class="button1" id="endgame">Zakończ grę</button>`;
    else S+="<h1>Czekaj na następne pytanie!</h1>"
    return S;
}

   //           kc <3

