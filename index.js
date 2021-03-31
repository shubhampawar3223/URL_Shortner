const express = require('express');
const app = express();
const mongodb = require('mongodb');
const mongoClient = mongodb.MongoClient;
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const port = process.env.PORT || 3500;
const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017';

app.use(express.json());
app.use(cors());

app.post('/signup',async(req,res)=>{
   try{
    let clientInfo = await mongoClient.connect(dbUrl);
       let db = clientInfo.db('project');
       //let clientInfo = await mongoClient.connect(dbUrl);
     let found = await db.collection('users').findOne({email:req.body.email}); 
     if(found){
        res.status(400).json({message:"User alredy exists"});
     }
     else{
     let salt = await bcrypt.genSalt(10);
     let hash = await bcrypt.hash(req.body.password,salt);
     req.body.password =hash;
     await db.collection('users').insertOne(req.body);
     res.status(200).json({message:"User created successfully."});
     sendMail(req.body.email, 'URL-Sortner Account Activation Mail.',"<p>Please Click <a href='http://localhost:3000/activation'>here<a> to activate your account.</p>");
    }
     clientInfo.close();
   }
   catch(e){
      console.log(e);
   }
})

app.post('/login',async(req,res)=>{
    try{
      let clientInfo = await mongoClient.connect(dbUrl);
      let db = clientInfo.db('project');
      let found = await db.collection('users').findOne({email:req.body.email});
      if(found){
        if(found.status === 'inactive')
        res.status(401).json({message:"Inactive account."})
        else{
        let verify = await bcrypt.compare(req.body.password, found.password);
        if(verify){
        let token = await jwt.sign({user_id:found._id},process.env.JWT_KEY); 
        res.status(200).json({message:"logged in successfylly.", token:token}) 
        }
        else{
            res.status(400).json({message:"Incorrect Password"});   
        }
       }
      }
      else{
         res.status(404).json({message:"User doesn't exist"});
      }
      clientInfo.close();
    }
    catch(e){
       console.log(e);
    }
 })
   
app.post('/fpass',async(req,res)=>{
    try{
     let clientInfo = await mongoClient.connect(dbUrl);
     let db = clientInfo.db('project');
     let resp = await db.collection('users').findOne({email:req.body.email});
     if(resp){
     res.status(200).json({message:"User found"});
     let k = Math.floor(Math.random()*(2000000) +1);
     let data = {
         "token":k,
         "user": req.body.email,
         "status": "active"
     }
     console.log(k)
     let s = await db.collection('fp-data').insertOne(data); 
        if(s){
        let content = "<p>Please Click <a href='http://localhost:3000/reset-pass/"+k+">here<a> to reset your password.</p>";
        sendMail(req.body.email, 'Password reset link',content);
       }
        else{
        res.send(500).json({message:"Internal Server Error"});
       }
     }else
     res.status(400).json({message:"User not found"});
     
     clientInfo.close();
    }
    catch(e){
      console.log(e);
    }
})    

app.post('/set-pass',async(req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('project');
        let resp = await db.collection('fp-data').findOne({token:req.body.token});
        //console.log(typeof(req.body.token))
        if(resp){
              if(resp.status !== 'inactive'){
             let salt = await bcrypt.genSalt(10);
             let hash = await bcrypt.hash(req.body.password,salt);
             let r1 = await db.collection('users').findOneAndUpdate({email:resp.user},{$set:{password:hash}});
             let r2 = await db.collection('fp-data').findOneAndUpdate({token:req.body.token},{$set:{status:'inactive'}});
             if(r1 && r2){
               res.send(200).json({message:"Password updated successfully."});  
             }
            }
            else{
                res.send(429).json({message:"Password reset link expired."}); 
            }
        }
        else{
            res.status(404).json({message:"Request not found.Please try again."});
        }
    }
    catch(e){
        console.log(e);
    }
})


app.get('/userInfo',authenticate,async(req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('project');
        let data = await db.collection('users').find().toArray();
        res.json(data);
        clientInfo.close();
    }
    catch(e){
       console.log(e);
    }
})

app.post('/activation',async (req, res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('project');
        let find = await db.collection('users').findOne({email:req.body.email});
        if(find){
         let c = await db.collection('users').findOneAndUpdate({email:req.body.email},{$set:{"status":"active"}})
         res.status(200).json({message:"Your account is activated"});
        }
        else{
            res.status(404).json({message:"User doesn't exist"});
        }
        clientInfo.close();
    } 
    catch(e){
         console.log(e);
    }
})


app.post('/resetDailyCount',async (req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('project');
        let c = await db.collection('stats').findOneAndUpdate({id:1},{$set:{"dailyCount":0}})
        res.status(200).json({message:"Daily count updated successfully."})
        clientInfo.close();
    }
    catch(e){
       console.log(e);
    }
})

app.post('/resetMonthlyCount',async (req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('project');
        let c = await db.collection('stats').findOneAndUpdate({id:2},{$set:{"monthlyCount":0}})
        res.status(200).json({message:"Monthly count updated successfully."})
        clientInfo.close();
    }
    catch(e){
       console.log(e);
    }
})

app.get('/getCounts',authenticate,async(req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('project');
        let data = await db.collection('stats').find().toArray();
        res.status(200).json({tCount:data[0].count, mCount:data[0].monthlyCount, dCount:data[0].dailyCount});
        clientInfo.close(); 
    }
    catch(e){
         console.log(e);
    }

})

app.post('/create-url',authenticate,async (req,res)=>{
     try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('project');
        let k = await db.collection('url-store').insertOne(req.body);
        res.status(200).json({message:"success"});
        await db.collection('stats').updateMany({},{$inc:{"dailyCount":1, "monthlyCount":1, "count":1}});
        clientInfo.close();
        //let id = db.collection('url-store').findOne
        //let data = await db.collection('users').findOne() 
        //await db.collection('').findOneAndUpdate({email:req.body.email},{$set:{}})
     }
     catch(e){
        console.log(e);
     }
})

app.get('/get-user-url/',authenticate,async(req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('project');
        //console.log(req.query)
        let data = await db.collection('url-store').find({creator:req.query.email}).toArray();
        res.status(200).json(data);
        clientInfo.close();
    }
    catch(e){
       console.log(e);
    }
})

app.get('/all-url',authenticate,async (req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('project');
        let data = await db.collection('url-store').find().toArray();
        res.status(200).json({data: data});
        clientInfo.close();
    }
    catch(e){
        console.log(e);
    }
})


function authenticate(req, res, next){
    if(req.headers.authorisation !== undefined){
      jwt.verify(
          req.headers.authorisation, 
          process.env.JWT_KEY,
          (err,decode)=>{
              if(decode !== undefined){
               next();
              }
              else{
                res.status(401).json({message: 'No Authorisation toke.'});           
              }
          })
    }
    else{
       res.status(401).json({message: 'No Authorisation toke.'}); 
    }
}


function sendMail(_email,_subject,_content){
       let mailTransporter = nodemailer.createTransport({
           service: 'gmail',
           auth: {
            user:'shubhganeshan@gmail.com',
            pass:'bytxnbanvbapmdln'
           }
       })

       let mailDetails = {
           from: 'shubhganeshan@gmail.com',
           to: _email,
           subject: _subject,
           html:_content
       }

       mailTransporter.sendMail(mailDetails, function(err,data){
             if(err){
                 console.log(err);
             }
             else{
                 console.log("Email sent successfully to"+ _email);
             }
       })
}

app.listen(port,()=>{console.log('Server is connected at'+port)})