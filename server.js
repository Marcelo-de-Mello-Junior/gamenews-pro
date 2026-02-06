// ================= GAME NEWS PRO — GLOBAL ENTERPRISE BUILD =================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const slugify = require('slugify');
const { v4: uuid } = require('uuid');
const fs = require('fs');
const fetch = (...a)=>import('node-fetch').then(({default:f})=>f(...a));

const app = express();
app.disable('x-powered-by');

const db = new sqlite3.Database('./database.db');

// ================= FILES =================

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static('uploads'));

// ================= MIDDLEWARE =================

app.use(express.urlencoded({extended:true}));
app.use(express.json());

app.use(session({
 secret:'global_game_news_secret',
 resave:false,
 saveUninitialized:false,
 cookie:{httpOnly:true}
}));

// ================= CACHE =================

const cache=new Map();
const setCache=(k,v,t=60000)=>cache.set(k,{v,e:Date.now()+t});
const getCache=k=>{
 const c=cache.get(k);
 if(!c||Date.now()>c.e){cache.delete(k);return null;}
 return c.v;
};

// ================= DATABASE =================

db.serialize(()=>{

db.run(`CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY,
 name TEXT,
 email TEXT UNIQUE,
 password TEXT,
 role TEXT DEFAULT 'user'
)`);

db.run(`CREATE TABLE IF NOT EXISTS posts(
 id INTEGER PRIMARY KEY,
 title TEXT,
 slug TEXT UNIQUE,
 content TEXT,
 banner TEXT,
 video TEXT,
 featured INTEGER DEFAULT 0,
 views INTEGER DEFAULT 0,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS comments(
 id INTEGER PRIMARY KEY,
 post_id INTEGER,
 author TEXT,
 content TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS translations(
 id INTEGER PRIMARY KEY,
 post_id INTEGER,
 lang TEXT,
 title TEXT,
 content TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS views_log(
 id INTEGER PRIMARY KEY,
 post_id INTEGER,
 ts DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// admin padrão
const hash=bcrypt.hashSync("admin123",10);
db.run(`INSERT OR IGNORE INTO users(id,name,email,password,role)
VALUES(1,'Admin','admin@games.com',?,'admin')`,hash);

});

// ================= HELPERS =================

const isEmployee=u=>u&&(u.role==='employee'||u.role==='admin');
const onlyAdmin=(req,res,n)=>req.session.user?.role==='admin'?n():res.redirect('/login');
const requireEmployee=(req,res,n)=>isEmployee(req.session.user)?n():res.redirect('/login');

const getLang=req=>{
 const h=req.headers["accept-language"];
 if(!h) return "pt";
 return h.split(",")[0].split("-")[0];
};

async function translate(text,target){
 try{
  const r=await fetch("https://libretranslate.de/translate",{
   method:"POST",
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({q:text,source:"auto",target})
  });
  const j=await r.json();
  return j.translatedText;
 }catch{
  return text;
 }
}

// ================= UI =================

const css=`body{margin:0;font-family:Arial;background:#0b1020;color:#e5e7eb}
header{background:#020617;border-bottom:1px solid #1f2937}
.top{max-width:1400px;margin:auto;display:flex;gap:12px;padding:14px}
.logo{font-weight:800}
.search{flex:1}
.search input{width:100%;padding:10px;border-radius:8px;background:#020617;color:#fff;border:1px solid #1f2937}
.layout{max-width:1400px;margin:auto;display:grid;grid-template-columns:160px 1fr 160px;gap:20px}
.ad{border:1px dashed #1f2937;margin-top:20px;text-align:center;padding:20px;color:#64748b}
.main{padding:20px}
.card{background:#020617;border:1px solid #1f2937;border-radius:14px;overflow:hidden}
.card img{width:100%;height:200px;object-fit:cover}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}
.btn{background:#38bdf8;color:#000;padding:8px 14px;border-radius:8px;text-decoration:none}`;

function shell(body,req,title="GameNews"){
 const u=req.session.user;
 let right=`<a class=btn href=/login>Login</a>`;
 if(u){
  if(u.role==='admin') right=`${u.name} | <a href=/admin>Admin</a> | <a href=/cms>CMS</a> | <a href=/logout>Sair</a>`;
  else if(isEmployee(u)) right=`${u.name} | <a href=/cms>CMS</a> | <a href=/logout>Sair</a>`;
  else right=`${u.name} | <a href=/logout>Sair</a>`;
 }
 return `<!doctype html><html><head>
 <meta name=viewport content="width=device-width,initial-scale=1">
 <meta name=description content="${title}">
 <title>${title}</title><style>${css}</style></head>
 <body>
 <header><div class=top>
 <div class=logo>🎮 GameNews</div>
 <form class=search action=/search><input name=q placeholder=Buscar></form>
 ${right}
 </div></header>
 <div class=layout>
 <div class=ad>ADS</div>
 <div class=main>${body}</div>
 <div class=ad>ADS</div>
 </div></body></html>`;
}

// ================= HOME =================

app.get('/',(req,res)=>{
 const c=getCache('home'); if(c) return res.send(c);
 db.all(`SELECT * FROM posts ORDER BY featured DESC, created_at DESC`,(e,p)=>{
  const html=shell(`<div class=grid>${
   p.map(x=>`<div class=card>
   <img src="/${x.banner||''}">
   <div style="padding:16px">
   <h3>${x.title}</h3>
   <p>${(x.content||'').substring(0,140)}...</p>
   <a href=/news/${x.slug}>Ler</a>
   </div></div>`).join('')
  }</div>`,req);
  setCache('home',html);
  res.send(html);
 });
});

// ================= NEWS + MULTILANG =================

app.get('/news/:slug',async(req,res)=>{

 const lang=getLang(req);

 db.get(`SELECT * FROM posts WHERE slug=?`,[req.params.slug],async(e,p)=>{
 if(!p) return res.send("Notícia não encontrada");

 db.run("UPDATE posts SET views=views+1 WHERE id=?",[p.id]);
 db.run("INSERT INTO views_log(post_id) VALUES(?)",[p.id]);

 if(lang!=='pt'){
  db.get(`SELECT * FROM translations WHERE post_id=? AND lang=?`,
  [p.id,lang],
  async(err,t)=>{
   if(!t){
    const tt=await translate(p.title,lang);
    const tc=await translate(p.content,lang);
    db.run(`INSERT INTO translations(post_id,lang,title,content) VALUES(?,?,?,?)`,
    [p.id,lang,tt,tc]);
    p.title=tt; p.content=tc;
   } else { p.title=t.title; p.content=t.content; }
   render();
  });
 } else render();

 function render(){
  res.send(shell(`
  <h1>${p.title}</h1>
  <img src="/${p.banner}" style="width:100%;border-radius:12px">
  <div>${p.content}</div>
  ${p.video||''}
  `,req,p.title));
 }

 });

});

// ================= SEARCH =================

app.get('/search',(req,res)=>{
 const q=req.query.q||'';
 db.all(`SELECT slug,title FROM posts WHERE title LIKE ?`,
 [`%${q}%`],
 (e,r)=>res.send(shell(r.map(x=>`<a href=/news/${x.slug}>${x.title}</a><br>`).join(''),req,'Busca')));
});

// ================= TRENDING =================

app.get('/trending',(req,res)=>{
 db.all(`SELECT title,slug,views FROM posts ORDER BY views DESC LIMIT 8`,
 (e,r)=>res.json(r));
});

// ================= LOGIN =================

app.get('/login',(req,res)=>res.send(`<form method=post>
<input name=email placeholder=email>
<input name=password type=password placeholder=senha>
<button>Entrar</button></form>`));

app.post('/login',(req,res)=>{
 db.get(`SELECT * FROM users WHERE email=?`,[req.body.email],(e,u)=>{
 if(!u||!bcrypt.compareSync(req.body.password,u.password))
  return res.redirect('/login');
 req.session.user={id:u.id,name:u.name,role:u.role};
 res.redirect('/');
 });
});

// ================= REGISTER =================

app.get('/register',(req,res)=>res.send(`<form method=post>
<input name=name><input name=email>
<input name=password type=password>
<button>Criar</button></form>`));

app.post('/register',(req,res)=>{
 const h=bcrypt.hashSync(req.body.password,10);
 db.run(`INSERT INTO users(name,email,password) VALUES(?,?,?)`,
 [req.body.name,req.body.email,h],
 ()=>res.redirect('/login'));
});

// ================= LOGOUT =================

app.get('/logout',(req,res)=>{
 req.session.destroy(()=>res.redirect('/'));
});

// ================= CMS =================

app.get('/cms',requireEmployee,(req,res)=>
 res.send(shell(`<a href=/cms/new>Novo Post</a>`,req)));

app.get('/cms/new',requireEmployee,(req,res)=>res.send(shell(`
<form method=post enctype=multipart/form-data>
<input type=file name=banner required>
<input name=title required>
<div contenteditable=true id=ed style="border:1px solid #333;padding:10px"></div>
<input type=hidden name=content id=content>
<textarea name=video></textarea>
<select name=featured><option value=0>Não</option><option value=1>Sim</option></select>
<button>Publicar</button>
</form>
<script>
document.querySelector("form").onsubmit=()=>content.value=ed.innerHTML
</script>
`,req)));

app.post('/cms/new',requireEmployee,upload.single('banner'),(req,res)=>{
 const slug=slugify(req.body.title,{lower:true,strict:true});
 db.run(`INSERT INTO posts(title,slug,content,banner,video,featured)
 VALUES(?,?,?,?,?,?)`,
 [req.body.title,slug,req.body.content,req.file.path,req.body.video,req.body.featured],
 err=>{
  if(err) return res.send("Título duplicado");
  cache.clear();
  res.redirect('/');
 });
});

// ================= ADMIN USERS =================

app.get('/admin',onlyAdmin,(req,res)=>{
 db.all(`SELECT id,name,email,role FROM users`,(e,u)=>{
  res.send(shell(u.map(x=>`
  ${x.name} — ${x.role}
  ${x.role==='user'?`<a href=/make-employee/${x.id}>Promover</a>`:''}
  <br>`).join(''),req));
 });
});

app.get('/make-employee/:id',onlyAdmin,(req,res)=>{
 db.run(`UPDATE users SET role='employee' WHERE id=?`,
 [req.params.id],
 ()=>res.redirect('/admin'));
});

// ================= API =================

app.get('/api/posts',(req,res)=>{
 db.all(`SELECT id,title,slug,views FROM posts`,(e,r)=>res.json(r));
});

// ================= START =================

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("RUNNING",PORT));
