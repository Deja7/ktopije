const HOSTNAME = 'localhost';
const AFKTIME = 600 * 1000;
const rooms = new Map();
const sessions = new Map();

const express = require("express");
const app = express();
app.use(express.static('public'));
app.listen(8000, HOSTNAME,() => {
    console.log(`express serving on ${HOSTNAME}:8000`)
})

const io = require("socket.io")(3000, {
    cors:{ origin: [`http://${HOSTNAME}:8000`] }
});

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

//AUTH
io.use((socket, next) =>{
    const token = socket.handshake.auth.token;
    if(token.length === 32) {
        if (!sessions.has(token)) {
            sessions.set(token, {});
            sessions.get(token).socket = socket.id;
        } else {//refreshed
            sessions.get(token).socket = socket.id;
            if (sessions.get(token).hasOwnProperty("room")) {
                socket.join(sessions.get(token).room);
                rooms.get(sessions.get(token).room).socket = socket;
                socket.emit('restore', token === rooms.get(sessions.get(token).room).sessions[0]);
            }
        }
        next();
    }
    else
        next(new Error("Invalid token"));
})

class room{
    constructor(roomID){
        //player data
        this.sessions = [];
        this.names = [];

        this.roomID = roomID;

        this.voteTime = 0;
        this.rounds = 0;
        this.packs = [];

        //console.log(this.roomID);
        this.state = 0; //0-queue   1-voting    2-results
        this.next = false;
        this.ready = true;

        this.votes = new Map();
        this.sorted = {};

        this.points = new Map();

        this.aliveTime = Date.now();

        this.Q = 0;
        this.qOrder = [];
        this.currentQ = 0;
    }
    genQOrder(){
        if(this.packs[0]) for(let i=0; i<qeasy.length; i++) this.qOrder.push(`e${i}`);
        if(this.packs[1]) for(let i=0; i<qmid.length; i++) this.qOrder.push(`m${i}`);
        if(this.packs[2]) for(let i=0; i<qhard.length; i++) this.qOrder.push(`h${i}`);
        const n = this.qOrder.length;
        const nn = n**2;
        for(let i=0; i<nn; i++) {
            let l = Math.floor(Math.random() * n), r = Math.floor(Math.random() * n);
            const tmp = this.qOrder[l];
            this.qOrder[l] = this.qOrder[r];
            this.qOrder[r] = tmp;
        }
        this.qOrder = this.qOrder.slice(0, this.rounds);
    }
    keepAlive(){
        this.aliveTime = Date.now();
    }
    async deleteRoom(){
        const socketRoom = this.roomID;
        for (let i = 0; i < this.sessions.length; i++)
            sessions.delete(this.sessions[i]);
        console.log(this.points);
        io.to(socketRoom).emit('kickinfo');
        //rooms.delete(socketRoom);
    }

    addPoints(winSessions){
        for(let i=0; i<winSessions.length; i++) {
            if(this.points.has(winSessions[i])){
                this.points.set(winSessions[i], this.points.get(winSessions[i]) + 1);
            }
            else{
                this.points.set(winSessions[i], 1);
            }
        }
    }
    isHost(session){
        //console.log(`${session} ${this.sessions[0]}`)
        return session === this.sessions[0];
    }
    emitPlayers(){
        io.to(this.roomID).emit('players-update', this.names);
    }
}

const fs = require("fs");
let qeasy = [], qmid = [], qhard = [];
async function loadQs(){
    await fs.readFile('easy.txt', (err, data) => {qeasy = data.toString().split('\n');});
    await fs.readFile('mid.txt', (err, data) => {qmid = data.toString().split('\n');});
    await fs.readFile('hard.txt', (err, data) => {qhard = data.toString().split('\n');});
    console.log("QUESTIONS LOADED");
}
loadQs();

function getQuestionAt(id){
    if(id[0] === "e") return qeasy[parseInt(id.slice(1))];
    if(id[0] === "m") return qmid[parseInt(id.slice(1))];
    if(id[0] === "h") return qhard[parseInt(id.slice(1))];
}
io.on('connection', (socket) => {
    const SESSION = socket.handshake.auth.token;
    console.log(`${socket.id} connected on token ${SESSION}`);

    if(sessions.get(SESSION).room !== undefined && rooms.has(sessions.get(SESSION).room)){       //if user reconnected
        socket.emit('host', rooms.get(sessions.get(SESSION).room).isHost(SESSION) ? 'true' : 'false');
        socket.emit('setfoot', sessions.get(SESSION).room);
        const state = parseInt(rooms.get(sessions.get(SESSION).room).state);
        if(state === 0){
            //queue
            socket.emit('queue', sessions.get(SESSION).room);
        }
        else if(state === 1){
            //voting
            if(!rooms.get(sessions.get(SESSION).room).votes.has(SESSION)) {
                const QUESTION = getQuestionAt(rooms.get(sessions.get(SESSION).room).Q);
                const currentQ = `Pytanie ${rooms.get(sessions.get(SESSION).room).currentQ}/${rooms.get(sessions.get(SESSION).room).rounds}`;
                socket.emit('question', QUESTION, rooms.get(sessions.get(SESSION).room).names, currentQ);
            }
            else {
                socket.emit('awaitresults');
            }
        }
        else if(state === 2){
            //results
            socket.emit('results', rooms.get(sessions.get(SESSION).room).sorted);
        }
        else if(state === 3){
            socket.emit('endresults', rooms.get(sessions.get(SESSION).room).endRes);
        }
        const socketRoom = sessions.get(SESSION).room.toString();
        socket.join(socketRoom);
    }
    else{
        socket.emit('menu');
    }

    //id(sessions.get(SESSION).room )
    //console.log(sessions);

    socket.on('joinroom', (username, roomID, callback) => {
        if(rooms.has(roomID) && username.length < 20){
            sessions.get(SESSION).room = roomID;
            sessions.get(SESSION).name = username;
            rooms.get(roomID).sessions.push(SESSION);
            rooms.get(roomID).names.push(username);
            console.log(`${username} joined ${roomID}. Current players: ${rooms.get(roomID).sessions.length}`);
            rooms.get(roomID).emitPlayers();
            socket.join(roomID);
            callback(true);
        }
        else {
            callback(false);
        }
    });

    socket.on('newroom', async (username, callback) =>{
        if(username.length < 20){
        let numberValid = false, roomID;
        while(!numberValid){
            roomID = Math.floor(Math.random() * 899999) + 100000;
            roomID = roomID.toString();
            if(!rooms.has(roomID)) numberValid = true;
        }
        rooms.set(roomID, new room(roomID));
        rooms.get(roomID).sessions.push(SESSION);
        //rooms.get(roomID).sockets.push(socket.id);
        rooms.get(roomID).names.push(username);
        socket.join(roomID);
        sessions.get(SESSION).room=roomID;
        sessions.get(SESSION).name=username;

        //rooms.get(roomID).updatePlayers();//emit message
        callback(roomID);
        }
    });

    socket.on('getplayers', ()=>{
        if(isSafe(SESSION)) {
            console.log(rooms.get(sessions.get(SESSION).room).names);
            if (rooms.has(sessions.get(SESSION).room))
                socket.emit('players-update', rooms.get(sessions.get(SESSION).room).names);
        }
    });

    socket.on('kick', (i, callback) => {
        if(isSafe(SESSION)) {
            const socketRoom = sessions.get(SESSION).room;
            if(i<rooms.get(socketRoom).names.length) {
                if (i === -1 && rooms.get(socketRoom).isHost(SESSION)) {
                    rooms.get(socketRoom).deleteRoom();
                } else if (i === -1) {
                    console.log(`${rooms.get(socketRoom).names[i]} left room`);
                    socket.emit('kickinfo');
                    sessions.delete(SESSION);                             //delete kicked session
                    for (i = 0; i < rooms.get(socketRoom).sessions.length; i++) {
                        if (rooms.get(socketRoom).sessions[i] === SESSION) break;
                    }
                    rooms.get(socketRoom).sessions.splice(i, 1);                         //delete kicked from room
                    rooms.get(socketRoom).names.splice(i, 1);                            // -,-
                    rooms.get(socketRoom).emitPlayers();
                } else if (rooms.get(socketRoom).isHost(SESSION)) {
                    console.log(`kicked ${rooms.get(socketRoom).names[i]}`);
                    io.to(sessions.get(rooms.get(socketRoom).sessions[i]).socket).emit('kickinfo'); //info to kicked client
                    sessions.delete(rooms.get(socketRoom).sessions[i]);                             //delete kicked session
                    rooms.get(socketRoom).sessions.splice(i, 1);                         //delete kicked from room
                    rooms.get(socketRoom).names.splice(i, 1);                            // -,-
                    //rooms.get(socketRoom).sockets.splice(i, 1);
                    rooms.get(socketRoom).emitPlayers();
                }
            }
        }
        //rooms.get(socketRoom).updatePlayers();
    })

    socket.on('endgame', ()=>{
        if(isSafe(SESSION)) {
            if (rooms.get(sessions.get(SESSION).room).isHost(SESSION)){
                rooms.get(sessions.get(SESSION).room).deleteRoom();
            }
        }
    });

    socket.on('startrequest', async (time, rounds, level)=>{
        if(isSafe(SESSION)) {
            //validate
            if (time > 0 && time < 60 && rounds > 0 && rounds <= 100 && (level[0] || level[1] || level[2])) {
                if (rooms.get(sessions.get(SESSION).room).state === 0 && rooms.get(sessions.get(SESSION).room).isHost(SESSION)) {
                    rooms.get(sessions.get(SESSION).room).voteTime = time;
                    rooms.get(sessions.get(SESSION).room).rounds = rounds;
                    rooms.get(sessions.get(SESSION).room).packs = level;
                    console.log(`Game started`);
                    rooms.get(sessions.get(SESSION).room).state = 1;
                    rooms.get(sessions.get(SESSION).room).genQOrder();
                    //console.log(rooms.get(sessions.get(SESSION).room).qOrder);
                    await runGame(sessions.get(SESSION).room, socket);
                } else console.log("Game already started");
            }
        }
    });

    socket.on('continue', ()=>{
        if(isSafe(SESSION)) {
            if (rooms.has(sessions.get(SESSION).room) && rooms.get(sessions.get(SESSION).room).isHost(SESSION) &&
                rooms.get(sessions.get(SESSION).room).state === 2) {
                console.log("Allowed next question");
                rooms.get(sessions.get(SESSION).room).next = true;
            }
        }
    })

    socket.on('vote', (val) =>{
        if(isSafe(SESSION)){
            val = parseInt(val);
            let c1 = (val >= 0) && (val <=rooms.get(sessions.get(SESSION).room).names.length);
            let c2 = Number.isInteger(val);
            let c3 = !rooms.get(sessions.get(SESSION).room).votes.has(SESSION);
            let c4 = rooms.get(sessions.get(SESSION).room).state === 1;
            //console.log(`${c1}, ${c2}, ${c3}, ${c4} `)
            if(c1 && c2 && c3 && c4){
                rooms.get(sessions.get(SESSION).room).votes.set(SESSION, val);
            }
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

setInterval(cleaner, 60000);

function cleaner(){
    rooms.forEach(async (val, key)=>{
        if(Date.now() - val.aliveTime >= AFKTIME) {
            console.log(`Removed room ${val.roomID} for being inactive`)
            await rooms.get(key).deleteRoom();
            rooms.delete(key);
        }
    })
}

async function runGame(roomID, socket){
    roomID = roomID.toString();
    await delay(100);

    for(let QI = 0; QI < rooms.get(roomID).qOrder.length; QI++) {                 ///CHANGE IMPORTANT ROUND COUNT
        rooms.get(roomID).keepAlive();
        rooms.get(roomID).state = 1;
        rooms.get(roomID).next = false;
        rooms.get(roomID).ready = false;
        rooms.get(roomID).currentQ = QI + 1;
        rooms.get(roomID).Q = rooms.get(roomID).qOrder[QI];
        const QUESTION =getQuestionAt(rooms.get(roomID).Q);
        //console.log(QUESTION);
        //console.log(rooms.get(roomID).players);
        //console.log(io.sockets.sockets.get(socket.id));

        rooms.get(roomID).votes.clear();                //clear votes buffer

        //const sockets = rooms.get(roomID).sockets;
        const currentQ = `Pytanie ${rooms.get(roomID).currentQ}/${rooms.get(roomID).qOrder.length}`;
        io.to(roomID).emit('question', QUESTION, rooms.get(roomID).names, currentQ);
        io.to(roomID).emit('time', 0);
        //for (let i = 0; i < sockets.length; i++) {
        //    io.to(sockets[i]).emit('question', QUESTION, rooms.get(roomID).names);
        //}
        const voted = await awaitVote(roomID);
        await delay(1000);
        const votes = rooms.get(roomID).votes;
        rooms.get(roomID).state = 2;
        console.log(rooms.get(roomID).votes);
        let results = [];
        for (let i = 0; i < rooms.get(roomID).names.length; i++) results.push(0);
        votes.forEach((val, key)=>{
            results[val]++;
        })

        let winSessions = [];
        let max = results[0];
        for (let i = 0; i < results.length; i++)
            if (results[i] > max) max = results[i];
        for (let i = 0; i < rooms.get(roomID).sessions.length; i++) {
            if (results[i] === max) winSessions.push(rooms.get(roomID).sessions[i]);
        }
        rooms.get(roomID).addPoints(winSessions);

        let resOut = {};
        for (let i = 0; i < rooms.get(roomID).names.length; i++)
            resOut[rooms.get(roomID).names[i]] = { "voteCount": results[i] };
        resOut = sortByPoints(resOut);

        //set who drinks
        let maxPts = results[0];
        for(let i=0; i<results.length; i++)
            if(results[i] > maxPts) maxPts = results[i];
        for (let i = 0; i < rooms.get(roomID).names.length; i++)
            if(resOut[rooms.get(roomID).names[i]]["voteCount"] === maxPts)
                resOut[rooms.get(roomID).names[i]]["drinks"] = 1;
            else resOut[rooms.get(roomID).names[i]]["drinks"] = 0;

        console.log(JSON.stringify(resOut));
        rooms.get(roomID).sorted = resOut;
        io.to(roomID.toString()).emit('results', resOut);

        rooms.get(roomID).ready = true;

        const play = await awaitContinue(roomID);
        if (play === false) return;
    }
    rooms.get(roomID).state = 3;
    //send endgame results
    //console.log(rooms.get(roomID).points);
    let endRes = {};
    rooms.get(roomID).points.forEach((val, key)=>{
        if(sessions.has(key)){
            const name = sessions.get(key).name
            endRes[name] = {
                "points": val,
                "drinks": 1
            };
        }
    })
    rooms.get(roomID).endRes = endRes;
    io.to(roomID).emit('endresults', endRes);

    //QUIET CLOSE IMPORTANT
    //console.log(endRes);
}


async function awaitContinue(roomID) {
    return new Promise(async (resolve) => {
        while(rooms.has(roomID) && (rooms.get(roomID).next === false || rooms.get(roomID).ready === false))
            await delay(500);
        resolve(rooms.has(roomID));
    });
}

async function awaitVote(roomID) {
    if (rooms.has(roomID)){
        const timeout = rooms.get(roomID).voteTime * 1000;
        const interval = 1000;
        const start = Date.now();
        return new Promise((resolve) => {
            const check = setInterval(() => {
                let k = (Date.now() - start) / (timeout) * 100;
                if(k>100)k=100;
                io.to(roomID).emit('time', k);
                //console.log(rooms.get(roomID).votes.size);
                //console.log(rooms.get(roomID).sockets.length);
                if(rooms.has(roomID))
                    if (rooms.get(roomID).votes.size === rooms.get(roomID).sessions.length) {
                    clearInterval(check);
                    resolve(1);
                    } else if (Date.now() - start >= timeout) {
                    clearInterval(check);
                    resolve(0);
                    }
                    //resolve(-1);
            }, interval);
        });
    }
    else return -1;
}

function sortByPoints(jsonObject) {
    const sortedArray = Object.entries(jsonObject).sort((a, b) => b[1].voteCount - a[1].voteCount);
    return Object.fromEntries(sortedArray);
}

function isSafe(SESSION){
    if(sessions.has(SESSION) && sessions.get(SESSION).room !== undefined && rooms.has(sessions.get(SESSION).room))
        return true;
    else
        return false;
}