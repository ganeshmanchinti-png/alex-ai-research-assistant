import { Component } from "react";
import "./App.css";

class App extends Component {
  state = {
    message: "",
    messages: [],
    loading: false,
    pdf: null,
    mode: "pdf",
  };

  onChangeMessage = (event) => {
    this.setState({
      message: event.target.value,
    });
  };

  onChangePdf = (event) => {
    const file = event.target.files[0];

    if (file && file.type !== "application/pdf") {
      alert("Please select a PDF file");
      event.target.value = "";
      return;
    }

    this.setState({
      pdf: file || null,
    });
  };

  onChangeMode = (event) => {
    this.setState({
      mode: event.target.value,
      pdf: null,
    });
  };

  sendMessage = async (event) => {
    event.preventDefault();

    const { message, loading, pdf, mode } = this.state;

    const userMessage = message.trim();

    if (!userMessage || loading) {
      return;
    }

    if (mode === "pdf" && !pdf) {
      alert("Please upload a PDF file first");
      return;
    }

    // Add user message
    this.setState((previousState) => ({
      messages: [
        ...previousState.messages,
        {
          role: "user",
          content: userMessage,
        },
      ],
      message: "",
      loading: true,
    }));

    try {
      // Create FormData
      const formData = new FormData();

      formData.append("message", userMessage);
      formData.append("mode", mode);

      if (mode === "pdf" && pdf) {
        formData.append("pdf", pdf);
      }

      // Backend API
      const response = await fetch("http://localhost:30000/chats", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || "Request failed");
      }

      // Add AI response
      this.setState((previousState) => ({
        messages: [
          ...previousState.messages,
          {
            role: "assistant",
            content: data.reply,
            sources: data.sources || [],
          },
        ],
      }));
    } catch (error) {
      this.setState((previousState) => ({
        messages: [
          ...previousState.messages,
          {
            role: "assistant",
            content: error.message,
          },
        ],
      }));
    } finally {
      this.setState({
        loading: false,
      });
    }
  };

  render() {
    const { message, messages, loading, pdf, mode } = this.state;

    return (
      <div className="app">
        <div className="chat-container">
          <h1>🤖 Alex AI Research Assistant</h1>

          <p>Powered by Groq AI</p>

          {/* Research Mode */}
          <div className="mode-selection">
            <label htmlFor="mode">Select Research Mode</label>

            <select
              id="mode"
              value={mode}
              onChange={this.onChangeMode}
              disabled={loading}
            >
              <option value="pdf">PDF Question Answering</option>

              <option value="web">Web Search</option>
            </select>
          </div>

          {/* PDF Upload */}
          {mode === "pdf" && (
            <div className="pdf-upload">
              <label htmlFor="pdf">📄 Upload PDF</label>

              <input
                id="pdf"
                type="file"
                accept=".pdf,application/pdf"
                onChange={this.onChangePdf}
                disabled={loading}
              />

              {pdf && <p>Selected PDF: {pdf.name}</p>}
            </div>
          )}

          {/* Chat Messages */}
          <div className="chat-messages">
            {messages.map((eachMessage, index) => (
              <div key={index} className={eachMessage.role}>
                <strong>{eachMessage.role === "user" ? "You" : "Alex"}</strong>

                <p>{eachMessage.content}</p>

                {/* Web Sources */}
                {eachMessage.sources && eachMessage.sources.length > 0 && (
                  <div className="sources">
                    <strong>Sources:</strong>

                    {eachMessage.sources.map((source, sourceIndex) => (
                      <p key={sourceIndex}>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title || source.url}
                        </a>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && <p>Alex is thinking... 🤔</p>}
          </div>

          {/* Chat Form */}
          <form onSubmit={this.sendMessage}>
            <input
              type="text"
              placeholder={
                mode === "pdf"
                  ? "Ask a question about your PDF..."
                  : "Search anything on the web..."
              }
              value={message}
              onChange={this.onChangeMessage}
              disabled={loading}
            />

            <button type="submit" disabled={loading || !message.trim()}>
              {loading ? "Please wait..." : "Send"}
            </button>
          </form>
        </div>
      </div>
    );
  }
}

export default App;
