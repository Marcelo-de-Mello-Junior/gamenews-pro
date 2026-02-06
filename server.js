// ================= GAME NEWS PRO — CLOUD DATABASE BUILD =================

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const slugify = require('slugify');
const { v4: uuid } = require('uuid');
const fs = require('fs');

const app = express();
app.disable('x-powered-by');

// ================= DATABASE (SUPABASE POSTGRES) =================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ================= FILE UPLOAD =================

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static('uploads'));

// ================= MIDDLEWARE =================

app.use(express.urlencoded({extended:true}));
app.use(express.json());

app.use(session({
 secret:'gamenews-secret',
 resave:false,
 saveUninitialized:false,
 cookie:{httpOnly:true}
}));

// ================= INIT TABLES =================

async function initDB(){

await pool.query(`
CREATE TABLE IF NOT EXISTS users(
 id SERIAL PRIMARY KEY,
 name TEXT,
 email TEXT UNIQUE,
 password TEXT,
 role TEXT DEFAULT 'user'
)`);

await pool.query(`
CREATE TABLE IF NOT EXISTS posts(
 id SERIAL PRIMARY KEY,
 title TEXT,
 slug TEXT UNIQUE,
 content TEXT,
 banner TEXT,
 video TEXT,
 featured INT DEFAULT 0,
 views INT DEFAULT 0,
 created_at TIMESTAMP DEFAULT NOW()
)`);

await pool.query(`
CREATE TABLE IF NOT EXISTS comments(
 id SERIAL PRIMARY KEY,
 post_id INT,
 author TEXT,
 content TEXT,
 created_at TIMESTAMP DEFAULT NOW()
)`);

// admin padrão
const hash = bcrypt.hashSync("admin123",10);

await pool.query(`
INSERT INTO users(name,email,password,role)
VALUES('Admin','admin@games.com',$1,'admin')
ON CONFLICT (email) DO NOTHING
`,[hash]);

}

initDB();

// ================= HELPERS =================

const isEmployee = u => u && (u.role==='employee'||u.role==='admin');
const requireEmployee = (req,res,n)=> isEmployee(req.session.user)?n():res.redirect('/login');
const onlyAdmin = (req,res,n)=> req.session.user?.role==='admin'?n():res.redirect('/login');

// ================= GOOGLE ADS SLOT =================

const ADS = `
<div style="text-align:center;margin:20px 0">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
<ins class="adsbygoogle"
style="display:block"
data-ad-client="ca-pub-XXXXXXXX"
data-ad-slot="YYYYYYYY"
data-ad-format="auto"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>
`;

// ================= UI =================

const css = `
body{margin:0;background:#0b1020;color:#e5e7eb;font-family:Arial}
header{background:#020617;border-bottom:1px solid #1f2937}
.top{max-width:1400px;margin:auto;display:flex;gap:12px;padding:14px}
.logo{font-weight:800;font-size:22px}
.search{flex:1}
.search input{width:100%;padding:10px;border-radius:8px;background:#020617;color:#fff;border:1px solid #1f2937}
.layout{max-width:1400px;margin:auto;display:grid;grid-template-columns:160px 1fr 160px;gap:20px}
.main{padding:20px}
.ad{border:1px dashed #1f2937;margin-top:20px;text-align:center;padding:20px}
.card{background:#020617;border:1px solid #1f2937;border-radius:14px;overflow:hidden}
.card img{width:100%;height:220px;object-fit:cover}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}
.btn{background:#38bdf8;color:#000;padding:8px 14px;border-radius:8px;text-decoration:none}
@media(max-width:1100px){.layout{grid-template-columns:1fr}.ad{display:none}}
`;

function shell(body,req,title="GameNews"){
 const u=req.session.user;
 let right=`<a class=btn href=/login>Login</a>`;
 if(u){
  if(u.role==='admin') right=`${u.name} | <a href=/admin>Admin</a> | <a href=/cms>CMS</a> | <a href=/logout>Sair</a>`;
  else if(isEmployee(u)) right=`${u.name} | <a href=/cms>Sala</a> | <a href=/logout>Sair</a>`;
  else right=`${u.name} | <a href=/logout>Sair</a>`;
 }
 return `<!doctype html><html><head>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${css}</style>
</head><body>
<header><div class=top>
<div class=logo>🎮 GameNews Pro</div>
<form class=search action=/search><input name=q placeholder="Buscar notícias"></form>
${right}
</div></header>
<div class=layout>
<div class=ad>${ADS}</div>
<div class=main>${body}</div>
<div class=ad>${ADS}</div>
</div></body></html>`;
}

// ================= HOME =================

app.get('/', async (req,res)=>{
 const r = await pool.query(`SELECT * FROM posts ORDER BY featured DESC, created_at DESC`);
 const cards = r.rows.map(p=>`
<div class=card>
<img src="/${p.banner}">
<div style="padding:16px">
<h3>${p.title}</h3>
<p>${p.content.substring(0,140)}...</p>
<a href=/news/${p.slug}>Ler</a>
</div></div>`).join('');

 res.send(shell(`<div class=grid>${cards}</div>`,req));
});

// ================= NEWS =================

app.get('/news/:slug', async (req,res)=>{
 const r = await pool.query(`SELECT * FROM posts WHERE slug=$1`,[req.params.slug]);
 const p = r.rows[0];
 if(!p) return res.send("Notícia não encontrada");

 await pool.query(`UPDATE posts SET views=views+1 WHERE id=$1`,[p.id]);

 const c = await pool.query(`SELECT * FROM comments WHERE post_id=$1 ORDER BY id DESC`,[p.id]);

 res.send(shell(`
<h1>${p.title}</h1>
<img src="/${p.banner}" style="width:100%;border-radius:12px">
${ADS}
<div>${p.content}</div>
${p.video||''}
<h3>Comentários</h3>
<form method=post action=/comment>
<input type=hidden name=post_id value=${p.id}>
<input name=author placeholder=Nome>
<textarea name=content></textarea>
<button class=btn>Comentar</button>
</form>
${c.rows.map(x=>`<p><b>${x.author}</b><br>${x.content}</p>`).join('')}
`,req,p.title));
});

// ================= COMMENT =================

app.post('/comment', async (req,res)=>{
 await pool.query(
  `INSERT INTO comments(post_id,author,content) VALUES($1,$2,$3)`,
  [req.body.post_id,req.body.author,req.body.content]
 );
 res.redirect('back');
});

// ================= LOGIN =================

app.get('/login',(req,res)=>res.send(shell(`
<h2>Login</h2>
<form method=post>
<input name=email placeholder=email>
<input name=password type=password placeholder=senha>
<button class=btn>Entrar</button>
</form>
<a href=/register>Criar conta</a>
`,req)));

app.post('/login', async (req,res)=>{
 const r = await pool.query(`SELECT * FROM users WHERE email=$1`,[req.body.email]);
 const u=r.rows[0];
 if(!u||!bcrypt.compareSync(req.body.password,u.password))
  return res.redirect('/login');
 req.session.user={id:u.id,name:u.name,role:u.role};
 res.redirect('/');
});

// ================= REGISTER =================

app.get('/register',(req,res)=>res.send(shell(`
<h2>Cadastro</h2>
<form method=post>
<input name=name placeholder=nome>
<input name=email placeholder=email>
<input name=password type=password placeholder=senha>
<button class=btn>Criar</button>
</form>
`,req)));

app.post('/register', async (req,res)=>{
 const h=bcrypt.hashSync(req.body.password,10);
 await pool.query(
 `INSERT INTO users(name,email,password) VALUES($1,$2,$3)`,
 [req.body.name,req.body.email,h]);
 res.redirect('/login');
});

// ================= CMS =================

app.get('/cms',requireEmployee,(req,res)=>res.send(shell(`<a class=btn href=/cms/new>Novo Post</a>`,req)));

app.get('/cms/new',requireEmployee,(req,res)=>res.send(shell(`
<form method=post enctype=multipart/form-data>
<input type=file name=banner required>
<input name=title required>
<textarea name=content></textarea>
<textarea name=video placeholder="embed video"></textarea>
<select name=featured><option value=0>Normal</option><option value=1>Destaque</option></select>
<button class=btn>Publicar</button>
</form>
`,req)));

app.post('/cms/new',requireEmployee,upload.single('banner'), async (req,res)=>{
 const slug=slugify(req.body.title,{lower:true,strict:true});
 await pool.query(
 `INSERT INTO posts(title,slug,content,banner,video,featured)
 VALUES($1,$2,$3,$4,$5,$6)`,
 [req.body.title,slug,req.body.content,req.file.path,req.body.video,req.body.featured]
 );
 res.redirect('/');
});

// ================= ADMIN =================

app.get('/admin',onlyAdmin, async (req,res)=>{
 const r = await pool.query(`SELECT id,name,role FROM users`);
 res.send(shell(r.rows.map(u=>
 `${u.name} — ${u.role} ${u.role==='user'?`<a href=/make-employee/${u.id}>Promover</a>`:''}<br>`
 ).join(''),req));
});

app.get('/make-employee/:id',onlyAdmin, async (req,res)=>{
 await pool.query(`UPDATE users SET role='employee' WHERE id=$1`,[req.params.id]);
 res.redirect('/admin');
});

// ================= LOGOUT =================

app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));

// ================= START =================

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("RUNNING",PORT));
