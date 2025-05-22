# Apache Superset 4.1.2 Dev Environment Setup (WSL2 Ubuntu 22.04 + PostgreSQL 16 + Node 20)

Este guia descreve os passos para configurar um ambiente de desenvolvimento local para o Apache Superset versão 4.1.2, utilizando:

*   Windows 11 com WSL2
*   Ubuntu 22.04 LTS
*   PostgreSQL 16 
*   Node.js v20+ (para construir o frontend)

## Pré-requisitos

Antes de começar, certifique-se de que você tem:

1.  Windows 11 com WSL2 habilitado e funcionando.
2.  Ubuntu 22.04 LTS instalado a partir da Microsoft Store.
3.  Recursos suficientes alocados para o WSL2 (Recomendado: 16GB+ de RAM mas pode ser com menos, testado com 8gb de ram também). Crie ou edite o arquivo `%UserProfile%\.wslconfig` no Windows e adicione:
    ```ini
    [wsl2]
    memory=8gb
    ```
    Depois, reinicie o WSL com `wsl --shutdown` no PowerShell.

## 1. Configuração do Ambiente Ubuntu

Abra seu terminal Ubuntu 22.04.

### 1.1. Atualizar Pacotes e Instalar Dependências Essenciais

```bash
sudo apt update
sudo apt upgrade -y

sudo apt install -y build-essential libssl-dev libffi-dev python3-dev python3-pip python3-venv libsasl2-dev libldap2-dev git curl wget gnupg pkg-config libmariadb-dev
```

### 1.2. Instalar PostgreSQL 16

O Ubuntu 22.04 instala o PostgreSQL 14 por padrão. Precisamos da versão 16 (ou superior) para compatibilidade com certos backups e por boas práticas.

```bash
# Remover instalações antigas (se houver)
sudo apt remove --purge postgresql postgresql-* postgresql-client postgresql-client-* -y
sudo apt autoremove -y

# Adicionar o repositório oficial do PostgreSQL
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update

# Instalar PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-client-16

# Verificar status
sudo service postgresql status
# Se não estiver rodando: sudo service postgresql start
```

### 1.3. Criar Usuário e Banco de Dados de Metadados do Superset

```bash
# Conectar como superusuário postgres
sudo -u postgres psql

# Dentro do psql, execute:
CREATE USER superset WITH PASSWORD 'SUA_SENHA_FORTE_AQUI'; -- << ESCOLHA E ANOTE UMA SENHA FORTE
CREATE DATABASE superset;
GRANT ALL PRIVILEGES ON DATABASE superset TO superset;

-- IMPORTANTE: Conceder permissões no schema public (Necessário para PostgreSQL 15+)
\c superset -- Conecta ao banco superset
GRANT USAGE ON SCHEMA public TO superset;
GRANT CREATE ON SCHEMA public TO superset;

\q -- Sai do psql
```
**Nota:** Lembre-se da senha que você definiu para o usuário `superset`. Você precisará dela em breve.

### 1.4. Instalar Node.js v20+ via NVM

```bash
# Instalar NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Carregar NVM (adicione estas linhas ao ~/.bashrc para persistência)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc

# Instalar e usar Node v20
nvm install 20
nvm alias default 20
nvm use default

# Verificar
node -v # Deve ser v20+
npm -v
```

## 2. Obter e Configurar o Código do Superset 4.1.2

### 2.1. Baixar e Extrair o Código Fonte

```bash
# Navegue para o diretório home
cd ~

# Baixe o código fonte da release 4.1.2
wget https://github.com/apache/superset/archive/refs/tags/4.1.2.tar.gz

# Extraia
tar -xzf 4.1.2.tar.gz

# Renomeie a pasta para facilitar (opcional, ajuste os caminhos se não renomear)
mv superset-4.1.2 superset

# Entre no diretório
cd superset
```

### 2.2. Configurar Ambiente Virtual Python e Dependências

```bash
# Criar venv
python3 -m venv venv

# Ativar venv
source venv/bin/activate
# Seu prompt deve iniciar com (venv)

# Atualizar pip
pip install --upgrade pip

# Instalar dependências Python (pode levar alguns minutos)
pip install -r requirements/development.txt
pip install psycopg2-binary # Driver PostgreSQL
pip install -e . # Instala Superset em modo editável
```

### 2.3. Criar Arquivo de Configuração do Superset

```bash
# Crie e edite o arquivo no diretório home
nano ~/superset_config.py
```

Cole o seguinte conteúdo, **substituindo os placeholders**:

```python
import os

# Configuração específica do Superset
ROW_LIMIT = 5000
SUPERSET_WEBSERVER_PORT = 8088

# Configuração do Flask App Builder
# MUDE ESTA CHAVE PARA ALGO LONGO E ALEATÓRIO! Use 'openssl rand -base64 42' para gerar uma.
SECRET_KEY = 'SUA_SECRET_KEY_ALEATORIA_E_FORTE_AQUI'

# Configuração do Banco de Dados de Metadados
# Use a senha REAL que você definiu para o usuário 'superset' no PostgreSQL
SQLALCHEMY_DATABASE_URI = 'postgresql+psycopg2://superset:SUA_SENHA_REAL_DO_PG_AQUI@localhost:5432/superset'

# Feature flags (Exemplo)
FEATURE_FLAGS = {
    "ENABLE_TEMPLATE_PROCESSING": True,
}

# Permite upload de arquivos
CSV_EXTENSIONS = {'csv', 'tsv', 'txt', 'tab'}
EXCEL_EXTENSIONS = {'xls', 'xlsx'}
ALLOWED_FILE_EXTENSIONS = set.union(CSV_EXTENSIONS, EXCEL_EXTENSIONS)

SUPERSET_WEBSERVER_TIMEOUT = 300
ENABLE_PROXY_FIX = True
```
Salve o arquivo (`Ctrl+X`, `Y`/`S`, `Enter`).

### 2.4. Definir Variável de Ambiente de Configuração

```bash
# No terminal com venv ativo
export SUPERSET_CONFIG_PATH=~/superset_config.py

# Adicione ao ~/.bashrc para persistência
echo 'export SUPERSET_CONFIG_PATH=~/superset_config.py' >> ~/.bashrc
# source ~/.bashrc # Para aplicar imediatamente
```

### 2.5. Inicializar Banco de Dados do Superset

```bash
# (Certifique-se que venv está ativo e SUPERSET_CONFIG_PATH está definido)
superset db upgrade
superset fab create-admin # Siga as instruções para criar o usuário admin da interface web
superset init # Inicializa roles e permissões
```

## 3. Configurar e Construir o Frontend

### 3.1. Instalar Dependências Node

```bash
# Navegue para o diretório frontend (dentro da pasta superset)
cd ~/superset/superset-frontend

# Instale as dependências exatas do lockfile (pode levar MUITOS minutos!)
npm ci
# Avisos de 'deprecated' são normais para esta versão e podem ser ignorados.
```

### 3.2. Construir Assets Estáticos (Recomendado/Troubleshooting)

Embora `npm run dev-server` funcione, construir os assets uma vez pode resolver problemas de arquivos estáticos não encontrados (como `loading.gif`).

```bash
# (Ainda em ~/superset/superset-frontend)
npm run build
```

## 4. Rodando os Servidores de Desenvolvimento

Você precisará de **DOIS** terminais Ubuntu abertos.

### Terminal 1: Servidor Backend (Flask)

```bash
# Navegue até o diretório raiz do Superset
cd ~/superset

# Ative o venv
source venv/bin/activate

# Certifique-se que a config path está definida
export SUPERSET_CONFIG_PATH=~/superset_config.py

# Inicie o servidor
superset run -p 8088 --with-threads --reload --debugger

# Deixe rodando
```

### Terminal 2: Servidor Frontend (Node)

```bash
# Abra um NOVO terminal
# Navegue até o diretório frontend
cd ~/superset/superset-frontend

# Verifique Node v20+ (nvm use default se necessário)
node -v

# Inicie o servidor dev
npm run dev-server

# Deixe rodando
```

## 5. Acessando o Superset

*   Abra seu navegador web no Windows.
*   Navegue para `http://localhost:9000`.
*   Faça login com as credenciais de admin criadas no passo 2.5.

## 6. Adicionando Fontes de Dados (Ex: PostgreSQL Local)

Para consultar seus bancos de dados no SQL Lab:

1.  Na interface do Superset, vá para **Data** -> **Databases**.
2.  Clique em **"+ DATABASE"**.
3.  Preencha:
    *   **DATABASE NAME:** Um nome amigável (ex: `Postgres Local`, `MRS Contador DB`).
    *   **SQLALCHEMY URI:** A URI de conexão para o banco *de análise*.
        *   Exemplo para o banco `postgres`: `postgresql+psycopg2://superset:SUA_SENHA_PG_AQUI@localhost:5432/postgres`
        *   Exemplo para o banco `mrscontador`: `postgresql+psycopg2://superset:SUA_SENHA_PG_AQUI@localhost:5432/mrscontador`
4.  Clique em **"TEST CONNECTION"**.
5.  Se OK, clique em **"ADD"** ou **"SAVE"**.
6.  Edite a conexão recém-adicionada (ícone de lápis), vá para a aba **SCHEMA** e clique em **"Sync schema from source"**. Salve novamente.

## 7. Restaurando Banco de Dados Customizado (Ex: mrscontador)

Se você tem backups (`.backup`, `.sql`) para restaurar:

1.  **Crie o Banco de Dados no PostgreSQL:**
    ```bash
    sudo -u postgres psql
    # Dentro do psql:
    CREATE DATABASE mrscontador;
    GRANT ALL PRIVILEGES ON DATABASE mrscontador TO superset;
    \q
    ```
2.  **Copie os Arquivos de Backup do Windows para o WSL:**
    ```bash
    mkdir ~/restore_files
    cd ~/restore_files
    cp /mnt/c/Users/<SeuUsuarioWindows>/Caminho/Para/arquivo.backup .
    ```
3.  **Restaure usando `pg_restore` (para .backup) ou `psql` (para .sql):**
    ```bash
    # Para .backup (digite a senha do user 'superset' do PG quando solicitado)
    pg_restore -h localhost -U superset -d mrscontador -v arquivo.backup

    # Para .sql (digite a senha do user 'superset' do PG quando solicitado)
    # psql -h localhost -U superset -d mrscontador -f arquivo.sql
    ```
4.  Adicione este banco como fonte de dados no Superset (veja passo 6).

## 8. Gerenciamento do WSL (PowerShell no Windows)

*   Listar distribuições: `wsl -l -v`
*   Encerrar uma distribuição: `wsl -t Ubuntu-22.04` (ou o nome da sua distro)
*   Desligar completamente o WSL: `wsl --shutdown`