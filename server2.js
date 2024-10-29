//settings
const HOSTNAME = '192.168.56.1';
const SECONDS_PER_ROUND = 20;

const rooms = new Map();
const sessions = new Map();

const express = require("express");
const app = express();
app.use(express.static('public'));
app.listen(8000, HOSTNAME,() => {
    console.log(`express serving on ${HOSTNAME}:8000`)
})

const io = require("socket.io")(3000, {
    cors:{
        origin: [`http://${HOSTNAME}:8000`]
    }
});

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

//MIDDLEWARE
io.use((socket, next) =>{
    const token = socket.handshake.auth.token;
    if(!sessions.has(token)) {
        sessions.set(token, {});
        sessions.get(token).socket = socket.id;
    }
    else{//refreshed
        //console.log(`${sessions.get(token).socket} => ${socket.id}`)
        sessions.get(token).socket = socket.id;
        if(sessions.get(token).hasOwnProperty("room")) {
            socket.join(sessions.get(token).room);
            rooms.get(sessions.get(token).room).socket = socket;
            socket.emit('restore', token === rooms.get(sessions.get(token).room).sessions[0]);
        }
    }
    next();
})

class room{
    constructor(roomID){
        this.sessions = [];
        this.names = [];
        this.roomID = roomID;
        //console.log(this.roomID);
        this.host = true;
        this.next = false;
        this.ready = true;
        this.qOrder = [];
        for(let i=0; i<questions.length; i++) this.qOrder.push(i);
        for(let i=0; i<questions.length ** 2; i++) {
            let l = Math.floor(Math.random() * questions.length), r = Math.floor(Math.random() * questions.length);
            const tmp = this.qOrder[l];
            this.qOrder[l] = this.qOrder[r];
            this.qOrder[r] = tmp;
        }
    }
    isHost(session){
        console.log(`${session} ${this.sessions[0]}`)
        return session === this.sessions[0];
    }
    updateNames(){
        let names = [];
        for(let i=0; i<this.sessions.length; i++)
            names.push(sessions.get(this.sessions[i]).name);
        this.names = names;
    }
    updatePlayers(){
        this.updateNames();
        io.to(this.roomID.toString()).emit('players-update', this.names);
    }
}

const fs = require("fs");
let questions = [];
loadQs();
function loadQs(){
    fs.readFile('questions.txt', (err, data) => {
        questions = data.toString().split('\r\n');
        //console.log(questions);
    });
}

io.on('connection', (socket) => {
    const SESSION = socket.handshake.auth.token;
    console.log(`${socket.id} connected on token ${SESSION}`);

    if(sessions.get(SESSION).room !== undefined){       //if user refreshed
        const socketRoom = sessions.get(SESSION).room.toString();
        socket.join(socketRoom);
    }

    //id(sessions.get(SESSION).room )
    //console.log(sessions);

    socket.on('joinroom', (username, roomID, callback) => {
        if(rooms.has(roomID)){
            sessions.get(SESSION).room = roomID;
            sessions.get(SESSION).name = username;
            rooms.get(roomID).sessions.push(SESSION);
            console.log(`${username} joined ${roomID}. Current players: ${rooms.get(roomID).sessions.length}`);

            socket.join(roomID);
            rooms.get(roomID).updatePlayers();
            callback(true);
        }
        else {
            console.log(`${username} tried to join ${roomID} (doesn't exist)`);
            callback(false);
        }
    });

    socket.on('newroom', async (username, callback) =>{
        let numberValid = false, roomID;
        while(!numberValid){
            roomID = Math.floor(Math.random() * 899999) + 100000;
            roomID = roomID.toString();
            if(!rooms.has(roomID)) numberValid = true;
        }
        rooms.set(roomID, new room(roomID));
        rooms.get(roomID).sessions.push(SESSION);
        socket.join(roomID);
        sessions.get(SESSION).room=roomID;
        sessions.get(SESSION).name=username;

        rooms.get(roomID).updatePlayers();//emit message
        callback(roomID);
    });

    socket.on('kick', (i, callback) => {
        const socketRoom = sessions.get(SESSION).room;
        if(rooms.get(socketRoom).sessions[0] === SESSION){
            console.log(`kicked ${rooms.get(socketRoom).names[i]}`);
            io.to(sessions.get(rooms.get(socketRoom).sessions[i]).socket).emit('kickinfo'); //info to kicked client
            sessions.delete(rooms.get(socketRoom).sessions[i]);                             //delete kicked session
            rooms.get(socketRoom).sessions.splice(i, 1);                         //delete kicked from room
            rooms.get(socketRoom).names.splice(i, 1);                            // -,-
        }
        rooms.get(socketRoom).updatePlayers();
    })

    socket.once('startrequest', async ()=>{
        console.log(`Game started`);
        await runGame(sessions.get(SESSION).room, socket);
    });

    socket.on('continue', ()=>{
        console.log("continue");
        if(rooms.get(sessions.get(SESSION).room).isHost(SESSION)) {
            console.log("Allowed next question");
            rooms.get(sessions.get(SESSION).room).next = true;
        }
    })

    socket.on('disconnect', (reason)=>{
        //if(sessions.get(SESSION).hasOwnProperty("room")) {
            //const room = sessions.get(SESSION).room;
            //if (rooms.get(room).sessions[0] === SESSION) {
            //    rooms.get(room).host = false;
            //}
        //}
        console.log(`${socket.id} disconnected`);
    })

});

async function runGame(roomID, socket){
    roomID = roomID.toString();
    await delay(100);

    for(let QI = 0; QI < questions.length; QI++){
        rooms.get(roomID).next = false;
        rooms.get(roomID).ready = false;
        let QUESTION = questions[rooms.get(roomID).qOrder[QI]];
        //console.log(QUESTION);
        //console.log(rooms.get(roomID).players);
        //console.log(io.sockets.sockets.get(socket.id));

        io.to(roomID.toString()).timeout((SECONDS_PER_ROUND+1)*1000).emit('newquestion', QUESTION, rooms.get(roomID).names, async (err, callback)=>{
            await console.log(callback);
            let results = [];
            for(let i=0; i<rooms.get(roomID).names.length; i++) results.push(0);
            for(let i=0; i<callback.length; i++){
                if(callback[i]!==-1) results[callback[i]]++;
            }
            let resOut = {};
            for(let i=0; i<rooms.get(roomID).names.length; i++)
                resOut[rooms.get(roomID).names[i]]=results[i];
            resOut = sortByPoints(resOut);
            console.log(JSON.stringify(resOut));
            rooms.get(roomID).ready = true;
            io.to(roomID.toString()).emit('results', resOut);
        });

        await awaitContinue(roomID);
    }
}

function closeRoom(roomID){
    rooms.delete(roomID);
}

async function awaitContinue(roomID) {
    return new Promise(async (resolve) => {
        while(rooms.get(roomID).next === false || rooms.get(roomID).ready === false)
            await delay(500);
        resolve(true);
    });
}

function sortByPoints(jsonObject) {
    const sortedArray = Object.entries(jsonObject).sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(sortedArray);
}

