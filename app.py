from flask import Flask, render_template, jsonify
from mcipc.query import Client
import socket
import os

app = Flask(__name__)

# Настройки сервера Minecraft
MC_SERVER_HOST = "ваш-ip-или-домен"
MC_SERVER_PORT = 25565

def get_server_status():
    """Получает статус сервера через Query Protocol."""
    try:
        with Client(MC_SERVER_HOST, MC_SERVER_PORT) as client:
            # Получаем базовую информацию
            stats = client.stats()
            return {
                "online": True,
                "players_online": stats.num_players,
                "max_players": stats.max_players,
                "players": stats.players,
                "motd": stats.motd,
                "version": stats.version
            }
    except (socket.timeout, ConnectionRefusedError, Exception) as e:
        return {"online": False, "error": str(e)}

@app.route("/")
def index():
    # Передаём в шаблон данные для начальной загрузки
    return render_template("index.html", server_data=get_server_status())

@app.route("/status")
def status():
    """API для обновления данных в реальном времени."""
    return jsonify(get_server_status())

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
