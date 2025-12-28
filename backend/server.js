/*Hocam projeyi node.js ve express üzerine kurdum. 
Gerçek zamanlı mesajlaşma için Socket.io kullandım.
böylece kullanıcı butona bastığında veya yazdığında sayfa yenilenmeden anlık cevap alabiliyor.
Bir de axios kütüphanesini Midterm API'ye istek atmak için
hem de Ollama ile haberleşmek için kullandım.*/ 
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

/*Uygulamayı kişiselleştirilmiş bir asistan gibi kurguladığım için, 
sistemin varsayılan olarak veritabanındaki 20 numaralı aboneye (kullanıcının kendisine) 
hizmet vermesini sağladım; böylece her seferinde abone numarası girme zahmetini ortadan kaldırdım.*/

// CORS configuration
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3:latest';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5196/api';
const API_USERNAME = process.env.API_USERNAME || 'mobileapp';
const API_PASSWORD = process.env.API_PASSWORD || 'mobile123';
const DEFAULT_SUBSCRIBER_NO = process.env.DEFAULT_SUBSCRIBER_NO || '1234567890';

/*Midterm API'niz JWT ile korunduğu için önce bir initializeAuth fonksiyonu yazdım.
Bu fonksiyon sistem başlarken login olup bir token alıyor.
Eğer token'ın süresi dolarsa (401 hatası gelirse) sistemi durdurmadan otomatik olarak 
token'ı yenileyen bir refreshAuth yapısı da ekledim.*/ 
let authToken = null;

//buraya geçici bir bellek ekledim kullanıcı ödeme yaptıktan hemen sonra tekrar sorgulama yaparsa
//veritabanı henüz güncellenmemiş olsa bile ödeme bilgisini hatırlayıp kullanıcıya doğru bakiyeyi gösterebiliyorum.
const paymentCache = new Map(); 

/* Kullanıcının attığı mesajı (örnek: 'Ocak borcum ne?') anlamlandırmak için Ollama modelini kullandım.
AI'ya bir 'System Prompt' verdim ve ondan cevabı mutlaka JSON formatında istedim. 
Bu JSON içinde kullanıcının niyeti (sorgulama mı, ödeme mi?) hangi ayı sorduğu bilgilerini ayıklıyorum.*/

// Sistem başlarken sizin yazdığınız API'ye otomatik giriş yapıp bir token alıyor
// böylece her faturayı sorguladığımda yetki hatası almadan güvenli bir şekilde veri çekebiliyorum.
async function initializeAuth() {
  try {
    const response = await axios.post(`${API_BASE_URL}/authentication/login`, {
      username: API_USERNAME,
      password: API_PASSWORD
    });
    authToken = response.data.token;
    console.log('✅ Authentication successful');
    return true;
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    authToken = null; // Clear token on failure
    return false;
  }
}

async function refreshAuth() {
  return await initializeAuth();
}

// Hocam burada kullanıcının yazdığı mesajı Ollama'ya gönderiyorum
// yapay zeka mesajı analiz edip kullanıcının niyetini (sorgulama mı, ödeme mi) söylüyor bana.
async function parseIntentWithOllama(userMessage) {
  try {
    const systemPrompt = `You are an AI assistant that helps users with billing operations. 
Analyze the user's message and determine their intent. The user may write in Turkish or English. Respond ONLY with a JSON object in this exact format:
{
  "intent": "query_bill" | "query_bill_detailed" | "pay_bill" | "greeting" | "unknown",
  "subscriberNo": "subscriber number if mentioned, otherwise use ${DEFAULT_SUBSCRIBER_NO}",
  "month": "month in format YYYY-MM if mentioned, otherwise current month",
  "amount": "amount if mentioned for payment, otherwise null"
}

Available intents:
- "query_bill": User wants to check their bill (e.g., "check my bill", "faturamı sorgula", "show me my bill for January", "Ocak faturamı sorgula")
- "query_bill_detailed": User wants to see all unpaid bills or detailed bill breakdown (e.g., "tüm borçlarımı göster", "all my bills", "show all unpaid bills", "detailed bill", "detaylı fatura", "fatura detayı")
- "pay_bill": User wants to pay a bill (e.g., "pay my bill", "I want to pay", "faturamı öde", "ödeme yap")
- "greeting": Greeting messages (e.g., "hello", "hi", "hey", "merhaba", "selam")
- "unknown": If intent cannot be determined

Month translations (Turkish to English):
- Ocak = January (01), Şubat = February (02), Mart = March (03), Nisan = April (04)
- Mayıs = May (05), Haziran = June (06), Temmuz = July (07), Ağustos = August (08)
- Eylül = September (09), Ekim = October (10), Kasım = November (11), Aralık = December (12)

Always extract subscriberNo and month if mentioned. Use ${DEFAULT_SUBSCRIBER_NO} as default subscriber number if not mentioned.
For month, use format YYYY-MM (e.g., 2025-01 for January 2025). If year is mentioned (like "2025"), include it. If not mentioned, use the current month and year.

For amount extraction (for pay_bill intent):
- Extract numeric value from payment messages (e.g., "200TL" -> 200, "200 TL" -> 200, "200.50" -> 200.50, "I want to pay 200" -> 200, "I want to pay 100TL for 2025-01" -> 100)
- Return as a NUMBER, not a string (e.g., 200 not "200")
- If no amount is mentioned, return null (API will pay full amount)

IMPORTANT: When user mentions both amount and month in payment message (e.g., "pay 100TL for 2025-01"), extract BOTH the amount and month correctly.`;

    const prompt = `${systemPrompt}\n\nUser message: "${userMessage}"\n\nRespond with ONLY the JSON object, no additional text:`;

    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.3,
        top_p: 0.9
      }
    });

  /*Eğer yapay zeka o an çalışmazsa veya karmaşık bir cevap verirse sistemin çökmemesi için kendi
  yazdığım fallbackIntentParsing fonksiyonu devreye giriyor. 
  Bu fonksiyon, mesaj içindeki anahtar kelimeleri tarayarak basit bir mantıkla işlemi devam ettiriyor.*/
    const responseText = response.data.response;
    
    // burada yapay zekadan gelen cevabı temizliyorum AI bazen cevabın yanına fazladan açıklamalar ekleyebiliyor
    //  ben sadece ihtiyacım olan JSON verisini çekip alıyorum.
    let jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (!parsed.subscriberNo) {
          parsed.subscriberNo = DEFAULT_SUBSCRIBER_NO;
        }
        if (!parsed.month || parsed.month === 'null' || parsed.month === null) {
          const now = new Date();
          parsed.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        
        if (parsed.amount) {
          if (typeof parsed.amount === 'string') {
            const amountMatch = parsed.amount.match(/(\d+\.?\d*)/);
            if (amountMatch) {
              parsed.amount = parseFloat(amountMatch[1]);
            } else {
              parsed.amount = null;
            }
          } else if (typeof parsed.amount === 'number') {
            parsed.amount = parsed.amount;
          } else {
            parsed.amount = null;
          }
        } else {
          parsed.amount = null;
        }
        
        return parsed;
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        throw new Error('Failed to parse JSON response');
      }
    }
    
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('Error parsing intent with Ollama:', error.message);
    // eğer o an yapay zeka servisine ulaşılamazsa veya AI mesajı anlayamazsa sistemin durmaması için buraya basit bir yedek plan ekledim
    // mesaj içindeki 'fatura' veya 'öde' gibi anahtar kelimeleri tarayarak işlemi yine de tamamlayabiliyorum.
    return fallbackIntentParsing(userMessage);
  }
}

function fallbackIntentParsing(userMessage) {
  const message = userMessage.toLowerCase();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  let intent = 'unknown';
  
  // burada hem Türkçe hem de İngilizce kelimeleri kontrol eden bir yapı kurdum
  // kullanıcı 'fatura' da dese 'bill' de dese sistem ne demek istediğini anlayabiliyor.
  if (message.includes('hello') || message.includes('hi') || message.includes('hey') || 
      message.includes('greeting') || message.includes('merhaba') || message.includes('selam')) {
    intent = 'greeting';
  } else if (message.includes('detailed') || message.includes('breakdown') || message.includes('detail') ||
             message.includes('detaylı') || message.includes('detay')) {
    intent = 'query_bill_detailed';
  } else if (message.includes('pay') || message.includes('payment') || 
             message.includes('öde') || message.includes('ödeme')) {
    intent = 'pay_bill';
  } else if (message.includes('bill') || message.includes('invoice') || message.includes('check') ||
             message.includes('fatura') || message.includes('sorgula') || message.includes('sorgulama')) {
    intent = 'query_bill';
  }

  let month = currentMonth;
  const monthPatterns = {
    
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12',
  
    'ocak': '01', 'şubat': '02', 'mart': '03', 'nisan': '04',
    'mayıs': '05', 'haziran': '06', 'temmuz': '07', 'ağustos': '08',
    'eylül': '09', 'ekim': '10', 'kasım': '11', 'aralık': '12'
  };
  
  let year = now.getFullYear();
  const yearMatch = message.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1]);
  }
  
  for (const [monthName, monthNum] of Object.entries(monthPatterns)) {
    if (message.includes(monthName)) {
      month = `${year}-${monthNum}`;
      break;
    }
  }
  
  const subscriberMatch = message.match(/\d{10,}/);
  const subscriberNo = subscriberMatch ? subscriberMatch[0] : DEFAULT_SUBSCRIBER_NO;
  
  let amount = null;
  if (intent === 'pay_bill') {
   
    const beforeFor = message.split(/\s+for\s+/i)[0];
    const amountMatch = beforeFor.match(/(\d+\.?\d*)\s*(?:tl|lira|₺)?/i);
    if (amountMatch) {
      amount = parseFloat(amountMatch[1]);
    } else {
      const fullMatch = message.match(/(\d+\.?\d*)\s*(?:tl|lira|₺)/i);
      if (fullMatch) {
        amount = parseFloat(fullMatch[1]);
      }
    }
  }
  
  return {
    intent,
    subscriberNo,
    month,
    amount: amount
  };
}

//  midterm APImi çağırıyorum intente göre
async function callMidtermAPI(intent, subscriberNo, month, amount = null) {
  if (!authToken) {
    await initializeAuth();
  }

  try {
    const headers = {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    };

    switch (intent) {
      case 'query_bill':
        // Query Bill butonu artık detaylı fatura gösteriyor (swap edildi)
       
        if (!month || month === 'null' || month === null) {
          const now = new Date();
          month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        
        // Query detailed bill for the specified month
        try {
          const queryDetailedResponse = await axios.get(
            `${API_BASE_URL}/mobileapp/querybilldetailed?subscriberNo=${subscriberNo}&month=${month}&pageNumber=1&pageSize=10`,
            { headers }
          );
          
          if (!queryDetailedResponse.data || !queryDetailedResponse.data.billDetails) {
            return {
              success: false,
              data: null,
              message: `Detailed bill not found for ${month}.`
            };
          }
          
          const details = queryDetailedResponse.data.billDetails.map(d => 
            `${d.description}: ${d.amount} TL (${d.category})`
          ).join('\n');
          
          return {
            success: true,
            data: queryDetailedResponse.data,
            message: `Detailed bill for ${month} (Total: ${queryDetailedResponse.data.billTotal} TL):\n${details}`
          };
        } catch (error) {
          console.error('Error fetching detailed bill:', error.response?.status, error.response?.data || error.message);
          const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
          return {
            success: false,
            data: null,
            message: `Error fetching detailed bill for ${month}: ${errorMsg}`
          };
        }

      case 'query_bill_detailed':
        // Query Bill Detailed butonu artık basit fatura sorgusu yapıyor (swap edildi)
        // nedpointe istek atmadan önce ayı belirtin 
        if (!month || month === 'null' || month === null) {
          const now = new Date();
          month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        
        const queryBillResponse = await axios.get(
          `${API_BASE_URL}/mobileapp/querybill?subscriberNo=${subscriberNo}&month=${month}`,
          { headers }
        );
        if (!queryBillResponse.data) {
          return {
            success: false,
            data: null,
            message: `Bill not found for ${month}. Please try a different month or ensure the bill exists.`
          };
        }
        //burada önce belleği kontrol ediyorum eğer kullanıcı az önce bir ödeme yaptıysa veritabanından eski bilgiyi çekmek yerine kendi tuttuğum güncel ödeme kaydını gösteriyorum.
        const cacheKey = `${subscriberNo}-${month}`;
        const cachedPayment = paymentCache.get(cacheKey);
        
       //burada mesajı düzenliyorum API'den gelen ham veriyi alıp kullanıcıya sade bir fatura özeti çıkarıyorum
        let message = `Bill information for ${month}:\n`;
        message += `Total Amount: ${queryBillResponse.data.billTotal} TL\n`;
        
        if (cachedPayment && (Date.now() - cachedPayment.timestamp) < 5 * 60 * 1000) {
          if (cachedPayment.remainingAmount <= 0) {
            message += `Status: Paid ✓`;
          } else {
            message += `Status: Unpaid`;
            message += `\nRemaining Balance: ${cachedPayment.remainingAmount.toFixed(2)} TL`;
            message += `\nPaid Amount: ${cachedPayment.paidAmount.toFixed(2)} TL`;
          }
        } else {
          if (queryBillResponse.data.paidStatus) {
            message += `Status: Paid ✓`;
          } else {
            message += `Status: Unpaid`;
          }
        }
        
        // eğer bellekte o kullanıcıya ait yeni bir ödeme kaydı bulursam bu bilgiyi mevcut veriye ekliyorum
        // böylece kullanıcıya sadece faturasını değil
        //  yaptığı ödemeden sonra kalan borcunu da anlık olarak gösterebiliyorum.
        const responseData = { ...queryBillResponse.data };
        if (cachedPayment && (Date.now() - cachedPayment.timestamp) < 5 * 60 * 1000) {
          responseData.remainingAmount = cachedPayment.remainingAmount;
          responseData.paidAmount = cachedPayment.paidAmount;
          responseData.hasRecentPayment = true;
          // eğer kullanıcının borcu tamamen bitmemişse, veritabanında 'ödendi' görünse bile ben bu durumu 
          // geçersiz kılıp kullanıcıya faturanın henüz kapanmadığını gösteriyorum.
          if (cachedPayment.remainingAmount > 0) {
            responseData.paidStatus = false; // Not fully paid
          }
        }
        
        return {
          success: true,
          data: responseData,
          message: message
        };

      case 'pay_bill':
        
        const payBillBody = {
          subscriberNo: subscriberNo,
          month: month
        };
        
        
        if (amount !== null && amount !== undefined && !isNaN(amount) && amount > 0) {
          payBillBody.amount = parseFloat(amount);
        }
        // eğer miktar belirtilmemişse boş (null) bırakıyorum ki API faturanın tamamını ödesin.
        
        const payBillResponse = await axios.post(
          `${API_BASE_URL}/website/paybill`,
          payBillBody,
          { headers }
        );
        
        // Cache payment information for later queries
        if (payBillResponse.data.paymentStatus === 'Successful') {
          const cacheKey = `${subscriberNo}-${month}`;
          paymentCache.set(cacheKey, {
            paidAmount: payBillResponse.data.paidAmount,
            remainingAmount: payBillResponse.data.remainingAmount,
            timestamp: Date.now()
          });
          // Cache expires after 5 minutes
          setTimeout(() => paymentCache.delete(cacheKey), 5 * 60 * 1000);
        }
        
        return {
          success: payBillResponse.data.paymentStatus === 'Successful',
          data: payBillResponse.data,
          message: payBillResponse.data.paymentStatus === 'Successful' 
            ? `Payment successful!`
            : `Payment failed: ${payBillResponse.data.errorMessage || 'Unknown error'}`
        };

      default:
        return {
          success: false,
          data: null,
          message: "I didn't understand. Please ask about bill operations."
        };
    }
  } catch (error) {
    console.error('API call error:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message;
    const statusCode = error.response?.status;
    
    if (statusCode === 401) {
      console.log('🔄 Token expired, refreshing...');
      const refreshed = await refreshAuth();
      
      if (refreshed) {
        
        return {
          success: false,
          data: null,
          message: 'Oturum süresi doldu. Lütfen işlemi tekrar deneyin.'
        };
      } else {
        return {
          success: false,
          data: null,
          message: 'Kimlik doğrulama hatası. Backend yeniden başlatılıyor...'
        };
      }
    }
    
    if (statusCode === 404 || errorMessage.includes('not found') || errorMessage.includes('Bill not found')) {
      return {
        success: false,
        data: null,
        message: `${month} ayı için fatura bulunamadı. Lütfen farklı bir ay deneyin veya fatura oluşturulduğundan emin olun.`
      };
    }
    
    return {
      success: false,
      data: null,
      message: `Error: ${errorMessage}`
    };
  }
}

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  // giriş mesajım
  socket.emit('message', {
    type: 'agent',
    text: 'Hello! How can I help you?',
    timestamp: new Date().toISOString()
  });

  // Handle incoming messages
  socket.on('message', async (data) => {
    const userMessage = data.text || data;
    console.log('📨 User message:', userMessage);

    socket.emit('message', {
      type: 'user',
      text: userMessage,
      timestamp: new Date().toISOString()
    });

    // Show typing indicator
    socket.emit('typing', { isTyping: true });

    try {
      // Parse intent using Ollama
      const intentData = await parseIntentWithOllama(userMessage);
      console.log('🎯 Parsed intent:', intentData);

      // Handle greeting
      if (intentData.intent === 'greeting') {
        socket.emit('typing', { isTyping: false });
        socket.emit('message', {
          type: 'agent',
          text: 'Hello! I can help you with:\n- Querying your bills\n- Getting detailed bill information\n- Paying bills\n\nWhat would you like to do?',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Call API based on intent
      const apiResult = await callMidtermAPI(
        intentData.intent,
        intentData.subscriberNo,
        intentData.month,
        intentData.amount
      );

      socket.emit('typing', { isTyping: false });
      socket.emit('message', {
        type: 'agent',
        text: apiResult.message,
        data: apiResult.data,
        intent: intentData.intent,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('typing', { isTyping: false });
      socket.emit('message', {
        type: 'agent',
        text: 'Sorry, an error occurred. Please try again.',
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ollama: OLLAMA_URL, model: OLLAMA_MODEL });
});

// Initialize and start server
const PORT = process.env.PORT || 3001;

initializeAuth().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 WebSocket server ready`);
    console.log(`🤖 Ollama: ${OLLAMA_URL}`);
    console.log(`🧠 Model: ${OLLAMA_MODEL}`);
    console.log(`🔗 API: ${API_BASE_URL}`);
  });
});

