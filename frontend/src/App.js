import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [socket, setSocket] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    newSocket.on('message', (data) => {
      setMessages((prev) => [...prev, data]);
      setIsTyping(false);
      scrollToBottom();
    });

    newSocket.on('typing', (data) => {
      setIsTyping(data.isTyping);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputValue.trim() && socket) {
      socket.emit('message', { text: inputValue.trim() });
      setInputValue('');
      inputRef.current?.focus();
    }
  };

  const handleQuickAction = (action, needsInput = false, needsPaymentInfo = false) => {
    if (socket) {
      if (needsPaymentInfo) {
        // Show prompts for payment: month and amount
        const month = prompt('Which month do you want to pay for? (e.g., January 2025, 2025-01)');
        if (month && month.trim()) {
          const amount = prompt('What amount do you want to pay? (e.g., 200, 200TL, 200 TL)');
          if (amount && amount.trim()) {
            socket.emit('message', { text: `${action} ${month.trim()} for ${amount.trim()}` });
          }
        }
      } else if (needsInput) {
        // Show prompt for month input
        const month = prompt('Which month? (e.g., January 2025, 2025-01)');
        if (month && month.trim()) {
          socket.emit('message', { text: `${action} ${month.trim()}` });
        }
      } else {
        socket.emit('message', { text: action });
      }
      inputRef.current?.focus();
    }
  };

  const formatMessage = (text) => {
    // Format message with line breaks
    return text.split('\n').map((line, index) => (
      <React.Fragment key={index}>
        {line}
        {index < text.split('\n').length - 1 && <br />}
      </React.Fragment>
    ));
  };

  const formatBillData = (data, intent) => {
    if (!data) return null;

    if (intent === 'query_bill') {
      // Query Bill shows detailed bill (swapped) - shows bill details
      return (
        <div className="bill-card detailed">
          <div className="bill-header">
            <span className="bill-label">Total Amount:</span>
            <span className="bill-value">{data.billTotal} TL</span>
          </div>
          <div className="bill-header">
            <span className="bill-label">Month:</span>
            <span className="bill-value">{data.month}</span>
          </div>
          {data.billDetails && data.billDetails.length > 0 && (
            <>
              <div className="bill-details">
                <h4>Bill Details:</h4>
                {data.billDetails.map((detail, index) => (
                  <div key={index} className="bill-detail-item">
                    <div className="detail-description">{detail.description}</div>
                    <div className="detail-category">{detail.category}</div>
                    <div className="detail-amount">{detail.amount} TL</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      );
    }

    if (intent === 'query_bill_detailed') {
      // Query Bill Detailed shows simple bill query (swapped) - shows remaining balance first
      const hasRecentPayment = data.hasRecentPayment && data.remainingAmount !== undefined;
      const isFullyPaid = hasRecentPayment && data.remainingAmount <= 0;
      
      return (
        <div className="bill-card">
          {hasRecentPayment && !isFullyPaid ? (
            <>
              <div className="bill-item">
                <span className="bill-label">Remaining Balance:</span>
                <span className="bill-value">{data.remainingAmount.toFixed(2)} TL</span>
              </div>
              <div className="bill-item">
                <span className="bill-label">Paid Amount:</span>
                <span className="bill-value">{data.paidAmount.toFixed(2)} TL</span>
              </div>
              <div className="bill-item">
                <span className="bill-label">Total Amount:</span>
                <span className="bill-value">{data.billTotal} TL</span>
              </div>
            </>
          ) : hasRecentPayment && isFullyPaid ? (
            <>
              <div className="bill-item">
                <span className="bill-label">Status:</span>
                <span className="bill-value paid">Paid</span>
              </div>
              <div className="bill-item">
                <span className="bill-label">Total Amount:</span>
                <span className="bill-value">{data.billTotal} TL</span>
              </div>
            </>
          ) : (
            <>
              <div className="bill-item">
                <span className="bill-label">Status:</span>
                <span className={`bill-value ${data.paidStatus ? 'paid' : 'unpaid'}`}>
                  {data.paidStatus ? 'Paid' : 'Unpaid'}
                </span>
              </div>
              <div className="bill-item">
                <span className="bill-label">Total Amount:</span>
                <span className="bill-value">{data.billTotal} TL</span>
              </div>
            </>
          )}
          <div className="bill-item">
            <span className="bill-label">Month:</span>
            <span className="bill-value">{data.month}</span>
          </div>
        </div>
      );
    }

    if (intent === 'pay_bill') {
      return (
        <div className="bill-card payment">
          <div className="bill-item">
            <span className="bill-label">Payment Status:</span>
            <span className={`bill-value ${data.paymentStatus === 'Successful' ? 'success' : 'error'}`}>
              {data.paymentStatus === 'Successful' ? 'Successful' : 'Failed'}
            </span>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="app">
      <div className="chat-container">
        <div className="chat-header">
          <h1>AI Billing Assistant</h1>
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● Connected' : '○ Not Connected'}
          </div>
        </div>

        <div className="messages-container">
          {messages.length === 0 && (
            <div className="welcome-message">
              <p>Welcome! I can help you with:</p>
              <div className="quick-actions">
          <button
            className="quick-action-btn query-bill"
            onClick={() => handleQuickAction('Show my bill', true)}
          >
            <span className="quick-action-icon">🔍</span>
            <span className="quick-action-text">Query Bill</span>
          </button>
          <button
            className="quick-action-btn query-detailed"
            onClick={() => handleQuickAction('Show my detailed bill', true)}
          >
            <span className="quick-action-icon">📄</span>
            <span className="quick-action-text">Query Bill Detailed</span>
          </button>
          <button
            className="quick-action-btn pay-bill"
            onClick={() => handleQuickAction('Pay my bill', false, true)}
          >
            <span className="quick-action-icon">💳</span>
            <span className="quick-action-text">Pay Bill</span>
          </button>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`message ${message.type === 'user' ? 'user-message' : 'agent-message'}`}
            >
              <div className="message-avatar">
                {message.type === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-content">
                <div className="message-text">{formatMessage(message.text)}</div>
                {message.data && formatBillData(message.data, message.intent)}
                <div className="message-timestamp">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="message agent-message">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="quick-actions-bottom">
          <button
            className="quick-action-btn-bottom query-bill"
            onClick={() => handleQuickAction('Show my bill', true)}
            disabled={!isConnected}
          >
            <span className="quick-action-icon">🔍</span>
            <span className="quick-action-text">Query Bill</span>
          </button>
          <button
            className="quick-action-btn-bottom query-detailed"
            onClick={() => handleQuickAction('Show my detailed bill', true)}
            disabled={!isConnected}
          >
            <span className="quick-action-icon">📄</span>
            <span className="quick-action-text">Query Bill Detailed</span>
          </button>
          <button
            className="quick-action-btn-bottom pay-bill"
            onClick={() => handleQuickAction('Pay my bill', false, true)}
            disabled={!isConnected}
          >
            <span className="quick-action-icon">💳</span>
            <span className="quick-action-text">Pay Bill</span>
          </button>
        </div>

        <form className="input-container" onSubmit={handleSendMessage}>
          <input
            ref={inputRef}
            type="text"
            className="message-input"
            placeholder="İsteğinizi buraya yazın..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={!isConnected}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!inputValue.trim() || !isConnected}
            title="Gönder"
          >
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;

