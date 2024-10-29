import {io} from "https://cdn.socket.io/4.8.0/socket.io.esm.min.js";
//import {io} from "/socket.js";
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
genSesKey();
console.log(sessionStorage.getItem("SESSIONID"));
const socket = io('http://192.168.56.1:3000', {
    auth:{
        token: sessionStorage.getItem("SESSIONID")
    }
});

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


//host join
$("#create-game").click(()=>{
    $("#content").load("shards/host-login.html", ()=>{
        $("#login").click(()=>{
            console.log($("#playerName").val());
            socket.emit('newroom', $("#playerName").val(), (callback)=>{
                //roomID=callback;
                console.log(callback);
                $("#content").load("shards/host-queue.html", ()=>{
                    $("#gamecode").text(`Podaj znajomym kod ${callback}`);
                    $("#foot").text(`Pokój: ${callback}`);
                    isHost = true;
                    $("#start-game").click(()=>{
                        socket.emit('startrequest');
                    })
                })
            })

        });
    });
});

//guest join
$("#join-game").click(()=>{
    $("#content").load("shards/guest-login.html", ()=>{
        $("#login").click(()=>{
            socket.emit('joinroom', $("#playerName").val(), $("#gameID").val(), (callback)=>{
                if(callback) {
                    let roomID = $("#gameID").val();
                    $("#content").load("shards/guest-queue.html", () => {
                        $("#gamecode").text(`Kod gry: ${roomID}`);
                        $("#foot").text(`Pokój: ${roomID}`);
                    })
                }
                else{
                    alert("Błędny kod");
                }
            });
        });
    });
});

socket.on('restore', async (host) =>{
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
})

socket.on('players-update', (players)=>{
    let S = "";
    for(let i = 0; i < players.length; i++){
        S+=`<div class="player-frame"><h2 class="noslide">${players[i]}</h2>`;
        if(isHost && i>0)S+=`<button class="button-none kick noslide" id="kick${i}">
<img src="media/close.png" alt="close" width="20" class="noslide"></button>`;
        S+=`</div>`
    }
    $("#players").html(S);
    for(let i = 0; i < players.length; i++) {
        $(`#kick${i}`).click(()=>{
            socket.emit('kick', `${i.toString()}`);
        });
    }

});


//kicked
socket.on('kickinfo', ()=>{
    location.reload();
})


//GAME
//socket.on('start', (players)=>{
    socket.on('newquestion', (question, players, callback) => {
        socket.off('players-update');
        $("#content").load("shards/voting.html", ()=> {

            $("#question").text(question);
            $("#players").html(renderRadios(players));
            $("#confirm").click(()=>{
                console.log($("input[name='RADIO']:checked").val());
                callback($("input[name='RADIO']:checked").val());
                //socket.emit('response', $("input[name='RADIO']:checked").val());
                $("#content").html(`<h1>Twój głos: ${players[$('input[name="RADIO"]:checked').val()]}</h1>` +
                    "<h1>Czekaj na wyniki!</h1>")
                socket.on('results', (results)=>{
                    console.log(results);
                    $("#content").html(renderResults(results));
                    $("#continue").click(()=>{
                        socket.emit('continue');
                    });
                })
            });
        });
    });
//});

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
    if(isHost)S+=`<button class="button1" id="continue">Następne pytanie</button>`;
    else S+="<h1>Czekaj na następne pytanie!</h1>"
    return S;
}

