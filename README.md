# Github :

https://github.com/melisademirbas/AIBillingAssistant

# Video Linki

https://drive.google.com/file/d/1maUjUUzNrHiBn6Ai17pZGIE4zQ5yZ4K9/view?usp=share_link

# SE 4458 - Assignment 2: AI Agent Chat Application

Bu proje, midterm ödevinde oluşturulan Query Bill, Pay Bill ve Query Bill Detailed API'lerini kullanarak bir AI Agent chat uygulaması geliştirir. Uygulama, Ollama (local LLM) kullanarak kullanıcı intent'lerini parse eder ve uygun API çağrılarını yapar.

#Uygulamayı kişiselleştirilmiş bir asistan gibi kurguladığım için, 
sistemin varsayılan olarak veritabanındaki 20 numaralı aboneye (kullanıcının kendisine) 
hizmet vermesini sağladım; böylece her seferinde abone numarası girme zahmetini ortadan kaldırdım.

#İçindekiler

- Proje Yapısı
- Teknolojiler
- Kurulum
- Kullanım
- Tasarım ve Varsayımlar
- Sorunlar ve Çözümler
- Video Linki

#Proje Yapısı

final_se4458/
├── backend/                # WebSocket Server (Node.js)
│   ├── server.js           # Ana server dosyası
│   ├── package.json        # Backend bağımlılıkları
│   └── .env.example        # Environment variables örneği
├── frontend/               # React Chat UI
│   ├── src/
│   │   ├── App.js         # Ana React component
│   │   ├── App.css        # Stil dosyası
│   │   └── index.js       # React entry point
│   ├── public/
│   └── package.json       # Frontend bağımlılıkları
└── README.md              # Bu dosya


#Teknolojiler
#Backend
- Node.js - Server runtime
- Express - Web framework
- Socket.io - WebSocket kütüphanesi
- Axios - HTTP client (API çağrıları için)
- Ollama - Local LLM (llama3:latest modeli)

# Frontend
- React - UI framework
- Socket.io-client - WebSocket client
- CSS3 - Modern UI styling

# API Entegrasyonu
- Midterm API (MobileProviderAPI) entegrasyonu
- JWT Authentication
- Query Bill, Pay Bill, Query Bill Detailed endpoints

# Kurulum
# Gereksinimler

1. Node.js
2. Ollama (yerel olarak kurulu ve çalışıyor olmalı)
3. Midterm API (çalışıyor olmalı)
4. Azure SQL Database (çalışıyor olmalı)

# Kullanım

1. Ollama'yı başlatın
2. Midterm API'yi başlatın
3. Backend server'ı başlatın (`cd backend && npm start`)
4. Frontend'i başlatın (`cd frontend && npm start`)
5. Tarayıcıda `http://localhost:3000` adresine gidin
6. Chat arayüzünde sorularınızı sorun:
   - "I want to check my bill for January"
   - "Show me detailed bill for January"
   - "I want to pay my bill for January"

# Örnek Kullanımlar

Kullanıcı: "Check my bill for January"
AI Agent: Query Bill API çağrısı yapar ve sonucu gösterir

Kullanıcı: "Pay my bill"
AI Agent: Pay Bill API çağrısı yapar ve ödeme durumunu gösterir


# Tasarım
# Mimari Tasarım

[User Browser] 
    ↕ WebSocket
[Backend Server (Node.js)]
    ↕ HTTP
[Ollama (Local LLM)]
    ↕ HTTP
[Midterm API (ASP.NET Core)]
    ↕ SQL
[Azure SQL Database]


#Varsayımlar

1. Abone Numarası Yönetimi

Varsayılan Abone: Kullanıcı mesajında spesifik bir abone numarası belirtmediği durumlarda, sistemin hata vermemesi için varsayılan olarak 2 (veya 1234567890) numaralı abone kabul edilir.

Dinamik Yapı: İstendiği takdirde bu numara .env (environment variable) dosyası üzerinden DEFAULT_SUBSCRIBER_NO parametresiyle kolayca değiştirilebilir.

2. Tarih ve Ay Formatı

Standart Format: Midterm API ile tam uyum sağlamak adına ay formatı her zaman YYYY-MM (Örn: 2025-01) olarak kabul edilmiştir.
AI Akıllılığı: Kullanıcı "Ocak faturası" dediğinde, AI Agent bunu otomatik olarak içinde bulunduğumuz yılın ilgili ayına (2025-01) çevirecek şekilde programlanmıştır. Kullanıcı ay belirtmezse sistem otomatik olarak içinde bulunulan ayı baz alır.

3. Kimlik Doğrulama ve Güvenlik (Authentication)

API Erişimi: Midterm API'sine erişim için mobileapp kullanıcı adı ve şifresi tanımlanmıştır.
Token Yönetimi: Sistem, ilk istekte JWT token'ı otomatik olarak alır ve her seferinde tekrar giriş yapmamak için bu token'ı oturum süresince hafızada (cache) saklar.

4. Yapay Zeka Modeli (Ollama)

Model Seçimi: Doğal dil işleme performansı yüksek olduğu için llama3 modeli tercih edilmiştir.
Erişim: Ollama'nın yerel makinede (localhost) 11434 portu üzerinden API hizmeti verdiği varsayılmıştır.

5. API Endpoints
Proje kapsamında Midterm API'deki şu endpoint'ler ile entegrasyon sağlanmıştır:
Fatura Sorgulama: GET /api/bills/{subscriberNo}/{month}
Detaylı Sorgulama: GET /api/bills/detail/{subscriberNo}/{month}
Fatura Ödeme: POST /api/bills/pay (Body üzerinden subscriberNo ve month bilgisi gönderilir).


# Karşılaştığım Sorunlar ve Çözümler

1. Midterm API ve Veritabanı Bağlantısı

Sorun: Başlangıçta Backend üzerinden kendi yazdığım Midterm API'sine erişirken 404 ve 500 hataları aldım. Ayrıca Azure üzerindeki veritabanı bazen bağlantıyı reddediyordu.

Çözüm: Swagger üzerinden API'nin ayakta olduğunu teyit ettim. Azure SQL tarafında ise Firewall ayarlarına kendi IP adresimi ekleyerek erişim izni verdim. index.js dosyasındaki Base URL adresini http://localhost:5196/api olarak güncelleyerek bağlantıyı sabitledim.

2. Frontend ve Backend Haberleşmesi (CORS)

Sorun: React tarafında butona bastığımda tarayıcı konsolunda kırmızı "CORS" hataları gördüm. Frontend, Backend'e güvenlik engeli nedeniyle ulaşamıyordu.

Çözüm: Node.js tarafında cors paketini kullanarak app.use(cors()) satırını ekledim. Böylece localhost üzerindeki farklı portların (3000 ve 3001) birbiriyle konuşmasına izin verdim.

3. WebSocket ve Real-Time Mesajlaşma

Sorun: Mesajlar bazen ekranda anlık görünmüyor veya sayfa yenilenince kayboluyordu.

Çözüm: Backend tarafında Socket.io (veya WebSocket) yapısını kurarken port çakışmalarına dikkat ettim. React'te useEffect hook'u ile mesajları bir dizi (state) içinde tutarak arayüzün anlık güncellenmesini sağladım.

# Video Linki

https://drive.google.com/file/d/1maUjUUzNrHiBn6Ai17pZGIE4zQ5yZ4K9/view?usp=share_link

# Notlar

- Bu proje için local LLM (Ollama) kullandığım için cloud deployment yapmadım.(attığınız assignment pdf'inde öyle diyordu)


