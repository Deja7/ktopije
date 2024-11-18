import {io} from "https://cdn.socket.io/4.8.0/socket.io.esm.min.js";
//import {io} from "/socket.js";
const CON = $("#content");
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
genSesKey();
console.log(localStorage.getItem("SESSIONID"));

let PAGES;
await fetch(`http://localhost:8000/pages.json`)
    .then((response) => response.json())
    .then((json) => PAGES = json);
//console.log(PAGES);

const socket = io(`http://localhost:3000`, {
    auth:{
        token: localStorage.getItem("SESSIONID")
    }
});

socket.on("connect", () => {
    $("#foot").text(``);
    console.log(`You connected with id ${socket.id}`);
})

function genSesKey(){
    if(localStorage.getItem("SESSIONID") === null) {
        const chars = "abcdefghijklmnoprstquvwxyzABCDEFGHIJKLMNOPRSTQUVWXYZ0123456789!@#$%^&*()_-+=";
        let S = "";
        for (let i = 0; i < 32; i++) {
            S += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        localStorage.setItem("SESSIONID", S);
        return S;
    }
    else return localStorage.getItem("SESSIONID");
}

let roomID;
let isHost = false;

$("#undo").click(async ()=>{
    await menu();
})
socket.on('menu', async ()=>{
    await menu();
})

async function menu(){
    $("#leave-room").hide();
    $("#undo").hide();
    await loadCON("menu");

    if(localStorage.getItem("NAME") === null) {}
        $("#playerName").val(localStorage.getItem("NAME"));


    //host join
    $("#create-game").click(async ()=>{
        const name = $("#playerName").val();
        if(name.length > 0) {
            localStorage.setItem("NAME", name);
            $("#undo").hide();
            console.log($("#playerName").val());
            socket.emit('newroom', name, async (callback) => {
                //roomID=callback;
                console.log(callback);
                await loadCON("host-queue");
                socket.emit('getplayers');
                $("#leave-room").show();
                $("#gamecode").text(`Podaj znajomym kod ${callback}`);
                $("#foot").text(`Pokój: ${callback}`);
                isHost = true;
                $("#start-game").click(() => {
                    const time = $("#settings-time").val();
                    const count = $("#settings-count").val();
                    const level = [$("#easy").is(':checked'), $("#mid").is(':checked'), $("#hard").is(':checked')];
                    //console.log(`${time}, ${count}, ${level}`)
                    if (level[0] || level[1] || level[2])
                        socket.emit('startrequest', time, count, level);
                    else alert("Wybierz poziom pytań!");
                })
            })
        }
        else{
            alert("Wpisz swoje imię!")
        }
    });

    //guest join
    $("#join-game").click(async ()=>{
        const name = $("#playerName").val()
        if(name.length > 0) {
            localStorage.setItem("NAME", name);
            await loadCON("guest-login")
            $("#hello-message").text(`Cześć ${name}!`);
            $("#undo").show();
            $("#login").click(()=>{
                $("#undo").hide();
                socket.emit('joinroom', name, $("#gameID").val(), async (callback) => {
                    if (callback) {
                        $("#leave-room").show();
                        let roomID = $("#gameID").val();
                        await loadCON("guest-queue");
                        socket.emit('getplayers');
                        $("#gamecode").text(`Kod gry: ${roomID}`);
                        $("#foot").text(`Pokój: ${roomID}`);
                        location.reload();
                    } else {
                        alert("Błędny kod");
                    }
                });
            });
        }
        else{
            alert("Wpisz swoje imię!");
        }
    });

    $("#how-to-play").click(async ()=> {
        $("#undo").show();
        await loadCON("tutorial");
        let page = 1;
        $(".tuto-right").click(()=>{
            $(`#tg${page}`).hide();
            page++;
            $(`#tg${page}`).show();
        })
        $(".tuto-left").click(()=>{
            $(`#tg${page}`).hide();
            page--;
            $(`#tg${page}`).show();
        })
    });

    $("#info").click(async ()=> {
        $("#undo").show();
        await loadCON("info");
    });
}

socket.on('queue', async (ROOM)=>{
    $("#leave-room").show();
    $("#undo").hide();
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
        S+=`<div class="player-frame"><h2 class="noslide inline">${players[i]}</h2>`;
        if(isHost && i>0)S+=`<button class="button-none kick noslide inline" id="kick${i}">
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
socket.on('question',async(question, players, currentQ) => {
    $("#leave-room").show();
    $("#undo").hide();
    //socket.off('players-update');
    await loadCON("voting");
    $("#question-number").text(currentQ);
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
    $("#undo").hide();
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

socket.on('endresults', async (results)=>{
    await loadCON("end-stats");
    $("#leave-room").show();
    $("#undo").hide();
    $("#timer-frame").hide();
    console.log(results);
    $("#players").html(renderEndResults(results));
    $("#leave-end").click(async ()=>{
        socket.emit('kick', -1);
    })
})

$("#leave-room").click(()=>{
    if(!isHost) {
        if (confirm("Na pewno chcesz wyjść?"))
            socket.emit('kick', -1);
    }
    else {
        if (confirm("UWAGA jesteś hostem, jeśli wyjdziesz z gry wszyscy gracze zostaną wyrzuceni! Czy na pewno chcesz wyjść?"))
            socket.emit('kick', -1);
    }
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
        if(Object.values(results)[i].drinks == 1){
            S+=`<div class="player-drinks"><img src="media/shot2.png" alt="" width="20" height = "20" class="inline noslide">
            <h2 class="inline">${Object.keys(results)[i]}: ${Object.values(results)[i]["voteCount"]}</h2></div>`;
        }
        else{
            S+=`<div><h2 class="inline">${Object.keys(results)[i]}: ${Object.values(results)[i]["voteCount"]}</h2></div>`;
        }
    }
    S+=`</div>`
    if(isHost)S+=`<button class="button1" id="continue">Następne</button>
    <button class="button1" id="endgame">Zakończ grę</button>`;
    else S+="<h1>Czekaj na następne pytanie!</h1>"
    return S;
}

function renderEndResults(results){
    let S = "";
    for(let i = 0; i < Object.keys(results).length; i++){
        if(Object.values(results)[i].drinks == 1){
            S+=`<div class="player-drinks"><h2 class="inline">${Object.keys(results)[i]}: ${Object.values(results)[i]["points"]}</h2>
            <img src="media/shot2.png" alt="" width="20" height = "20" class="inline noslide"></div>`;
        }
        else{
            S+=`<div><h2 class="inline">${Object.keys(results)[i]}: ${Object.values(results)[i]["voteCount"]}</h2></div>`;
        }
    }
    return S;
}

   //           kc <3