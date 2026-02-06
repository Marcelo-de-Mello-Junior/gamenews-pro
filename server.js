// ================= GAME NEWS PRO — FINAL BUILD =================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const slugify = require('slugify');
const { v4: uuid } = require('uuid');
const fs = require('fs');

const app = express();
app.disable('x-powered-by');

// ================= CONFIG =================

const ADS_ENABLED = true;
const ADS_CLIENT = "ca-pub-9520234118451048";

function ad(slot){
 if(!ADS_ENABLED) return "";
 return `
 <ins class="adsbygoogle"
  style="display:block"
  data-ad-client="${ADS_CLIENT}"
  data-ad-slot="${slot}"
  data-ad-format="auto"
  data-full-width-responsive="true"></ins>
 <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
 `;
}

// ================= INIT =================

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static('uploads'));

app.use(express.urlencoded({extended:true}));
app.use(express.json());

app.use(session({
 secret:'gamenews-secret',
 resave:false,
 saveUninitialized:false
}));

const db = new sqlite3.Database('./database.db');

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

const hash=bcrypt.hashSync("admin123",10);
db.run(`INSERT OR IGNORE INTO users(id,name,email,password,role)
VALUES(1,'Admin','admin@games.com',?,'admin')`,hash);

});

// ================= HELPERS =================

const isEmployee=u=>u&&(u.role==='employee'||u.role==='admin');
const onlyAdmin=(req,res,n)=>req.session.user?.role==='admin'?n():res.redirect('/login');
const onlyEmployee=(req,res,n)=>isEmployee(req.session.user)?n():res.redirect('/login');

const getLang=req=>{
 const h=req.headers["accept-language"];
 if(!h) return "pt";
 return h.split(",")[0].split("-")[0];
};

// ================= DESIGN =================

const css = `
*{box-sizing:border-box}
body{margin:0;font-family:Inter,Arial;background:#0b1020;color:#e5e7eb}
header{background:#020617;border-bottom:1px solid #1f2937;position:sticky;top:0;z-index:9}
.top{max-width:1300px;margin:auto;display:flex;gap:14px;padding:14px;align-items:center}
.logo{font-weight:900;font-size:20px}
.search{flex:1}
.search input{width:100%;padding:11px;border-radius:10px;background:#020617;border:1px solid #1f2937;color:white}
.navbtn{background:#38bdf8;color:#000;padding:8px 14px;border-radius:10px;text-decoration:none;font-weight:600}
.layout{max-width:1300px;margin:auto;display:grid;grid-template-columns:160px 1fr 160px;gap:20px}
.main{padding:20px}
.ad{margin-top:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}
.card{background:#020617;border:1px solid #1f2937;border-radius:16px;overflow:hidden;transition:.25s}
.card:hover{transform:translateY(-4px)}
.card img{width:100%;height:200px;object-fit:cover}
.card-body{padding:16px}
.card h3{margin:0 0 10px}
.btn{background:#38bdf8;border:none;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer}
.form{max-width:420px;margin:60px auto;background:#020617;padding:30px;border-radius:16px;border:1px solid #1f2937}
.form input,.form textarea,.form select{
 width:100%;padding:12px;margin-bottom:12px;
 border-radius:10px;background:#020617;border:1px solid #1f2937;color:white
}
.error{background:#7f1d1d;padding:10px;border-radius:10px;margin-bottom:10px}
@media(max-width:1100px){.layout{grid-template-columns:1fr}.ad{display:none}}
`;

function shell(body,req,title="GameNews"){
 const u=req.session.user;

 let right=`<a class=navbtn href=/login>Login</a>
            <a class=navbtn href=/register>Cadastrar</a>`;

 if(u){
  if(u.role==='admin')
   right=`${u.name}
   <a class=navbtn href=/cms>CMS</a>
   <a class=navbtn href=/admin>Admin</a>
   <a class=navbtn href=/logout>Sair</a>`;
  else if(isEmployee(u))
   right=`${u.name}
   <a class=navbtn href=/cms>CMS</a>
   <a class=navbtn href=/logout>Sair</a>`;
  else
   right=`${u.name}
   <a class=navbtn href=/logout>Sair</a>`;
 }

 return `<!doctype html><html><head>
 <meta name=viewport content="width=device-width,initial-scale=1">
 <title>${title}</title>
 <style>${css}</style>
 ${ADS_ENABLED?`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CLIENT}" crossorigin="anonymous"></script>`:""}
 </head><body>

<header><div class=top>
<div class=logo>🎮 GameNews Pro</div>
<form class=search action=/search>
<input name=q placeholder="Buscar notícias">
</form>
${right}
</div></header>

${ad("1001")}

<div class=layout>
<div class=ad>${ad("1002")}</div>
<div class=main>${body}</div>
<div class=ad>${ad("1003")}</div>
</div>

</body></html>`;
}

// ================= HOME =================

app.get('/',(req,res)=>{
 db.all(`SELECT * FROM posts ORDER BY featured DESC, created_at DESC`,(e,p)=>{

 const html = shell(`
 <div class=grid>
 ${p.map((x,i)=>`
 <div class=card>
 <img src="/${x.banner||''}">
 <div class=card-body>
 <h3>${x.title}</h3>
 <p>${(x.content||'').slice(0,140)}...</p>
 <a class=navbtn href=/news/${x.slug}>Ler notícia</a>
 </div></div>
 ${i===2?ad("2001"):""}
 `).join('')}
 </div>
 `,req);

 res.send(html);
 });
});

// ================= NEWS =================

app.get('/news/:slug',(req,res)=>{
 db.get(`SELECT * FROM posts WHERE slug=?`,[req.params.slug],(e,p)=>{
 if(!p) return res.send(shell("Notícia não encontrada",req));

 db.run(`UPDATE posts SET views=views+1 WHERE id=?`,[p.id]);

 res.send(shell(`
 <h1>${p.title}</h1>
 <img src="/${p.banner}" style="width:100%;border-radius:16px">

 ${ad("3001")}

 <div style="margin-top:20px;line-height:1.7">${p.content}</div>

 ${p.video||''}

 ${ad("3002")}
 `,req,p.title));
 });
});

// ================= SEARCH =================

app.get('/search',(req,res)=>{
 const q=req.query.q||"";
 db.all(`SELECT slug,title FROM posts WHERE title LIKE ?`,
 [`%${q}%`],
 (e,r)=>{
 res.send(shell(r.map(x=>`
 <div class=card><div class=card-body>
 <a href=/news/${x.slug}>${x.title}</a>
 </div></div>`).join(''),req,"Busca"));
 });
});

// ================= LOGIN =================

app.get('/login',(req,res)=>{
 res.send(shell(`
 <form class=form method=post>
 <h2>Login</h2>
 <input name=email placeholder=email required>
 <input name=password type=password placeholder=senha required>
 <button class=btn>Entrar</button>
 </form>
 `,req,"Login"));
});

app.post('/login',(req,res)=>{
 db.get(`SELECT * FROM users WHERE email=?`,[req.body.email],(e,u)=>{
 if(!u || !bcrypt.compareSync(req.body.password,u.password))
  return res.send(shell(`<div class=form><div class=error>Login inválido</div>
  <a class=navbtn href=/login>Tentar novamente</a></div>`,req));
 req.session.user={id:u.id,name:u.name,role:u.role};
 res.redirect('/');
 });
});

// ================= REGISTER =================

app.get('/register',(req,res)=>{
 res.send(shell(`
 <form class=form method=post>
 <h2>Criar Conta</h2>
 <input name=name required placeholder=Nome>
 <input name=email required placeholder=email>
 <input name=password type=password required placeholder=senha>
 <button class=btn>Cadastrar</button>
 </form>
 `,req,"Cadastro"));
});

app.post('/register',(req,res)=>{
 const h=bcrypt.hashSync(req.body.password,10);
 db.run(`INSERT INTO users(name,email,password) VALUES(?,?,?)`,
 [req.body.name,req.body.email,h],
 err=>{
 if(err) return res.send(shell(`<div class=form><div class=error>Email já usado</div></div>`,req));
 res.redirect('/login');
 });
});

// ================= CMS =================

app.get('/cms',onlyEmployee,(req,res)=>{
 res.send(shell(`
 <a class=navbtn href=/cms/new>➕ Nova notícia</a>
 `,req,"CMS"));
});

app.get('/cms/new',onlyEmployee,(req,res)=>{
 res.send(shell(`
 <form class=form method=post enctype=multipart/form-data>
 <h2>Nova notícia</h2>
 <input name=title required placeholder=Título>
 <textarea name=content required placeholder=Conteúdo></textarea>
 <textarea name=video placeholder="Embed vídeo"></textarea>
 <select name=featured>
 <option value=0>Normal</option>
 <option value=1>Destaque</option>
 </select>
 <input type=file name=banner required>
 <button class=btn>Publicar</button>
 </form>
 `,req));
});

app.post('/cms/new',onlyEmployee,upload.single('banner'),(req,res)=>{
 const slug=slugify(req.body.title,{lower:true,strict:true});
 db.run(`INSERT INTO posts(title,slug,content,banner,video,featured)
 VALUES(?,?,?,?,?,?)`,
 [req.body.title,slug,req.body.content,req.file.path,req.body.video,req.body.featured],
 ()=>res.redirect('/'));
});

// ================= ADMIN =================

app.get('/admin',onlyAdmin,(req,res)=>{
 db.all(`SELECT id,name,email,role FROM users`,(e,u)=>{
 res.send(shell(u.map(x=>`
 <div class=card><div class=card-body>
 ${x.name} — ${x.role}
 ${x.role==='user'?`<a class=navbtn href=/promote/${x.id}>Promover</a>`:''}
 </div></div>`).join(''),req,"Admin"));
 });
});

app.get('/promote/:id',onlyAdmin,(req,res)=>{
 db.run(`UPDATE users SET role='employee' WHERE id=?`,
 [req.params.id],()=>res.redirect('/admin'));
});

// ================= LOGOUT =================

app.get('/logout',(req,res)=>{
 req.session.destroy(()=>res.redirect('/'));
});

// ================= START =================

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("RUNNING",PORT));
