import os
from datetime import timedelta
from flask import current_app
# You might need to adjust the import path based on FAB version/structure if this fails
from flask_appbuilder.security.sqla.models import User
import logging
import random

logger = logging.getLogger(__name__)

#---------------------------------------------------------
# Configuração específica do Superset
#---------------------------------------------------------
ROW_LIMIT = 5000
SUPERSET_WEBSERVER_PORT = 8088 # Porta padrão do Flask dev

#---------------------------------------------------------
# Configuração do Flask App Builder
#---------------------------------------------------------
# Sua chave secreta será usada para assinar o cookie de sessão
# e criptografar informações sensíveis no banco de dados
# Certifique-se de alterar esta chave para sua implantação
SECRET_KEY = 'M2JmZjhiYzk0NzJmYjZkYWNmOWMyNDg0MzIzNzExOGIzNGJiMDllOGMwNDE5Y2MwNGM3OGZiN2RjMzZiYTNkNTgwYTllNGRlMzc5MTZhZjQ3MmJmOWE0ZTg4NGYxMzlhMWE4MGQxMzI0NDhhODRkZGY4OWYxYmQ0ZjgyZmZlNjQ=' # MUDE ESTA CHAVE!

# Tempo de expiração para tokens de acesso JWT
JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=1)

#---------------------------------------------------------
# Configuração do Banco de Dados
#---------------------------------------------------------
# A URI do banco de dados para o metadado do Superset
SQLALCHEMY_DATABASE_URI = 'postgresql+psycopg2://superset:superset@localhost/superset'

TALISMAN_ENABLED = False  # remove X-Frame-Options que o Talisman injeta

#---------------------------------------------------------
# Feature flags
#---------------------------------------------------------
# Habilita processamento de template (Jinja) no SQL Lab
FEATURE_FLAGS = {
    "ENABLE_TEMPLATE_PROCESSING": True,
    "EMBEDDED_SUPERSET": True,  # Habilita o modo de Superset embarcado
}

# Permite upload de arquivos CSV/Excel
CSV_EXTENSIONS = {'csv', 'tsv', 'txt', 'tab'}
EXCEL_EXTENSIONS = {'xls', 'xlsx'}
ALLOWED_EXTENSIONS = set.union(CSV_EXTENSIONS, EXCEL_EXTENSIONS)
ALLOWED_FILE_EXTENSIONS = ALLOWED_EXTENSIONS

SUPERSET_WEBSERVER_TIMEOUT = 300
ENABLE_PROXY_FIX = False # Se estiver rodando atrás de um proxy
# X_FRAME_OPTIONS = '' # Removido para tentar com OVERRIDE_HTTP_HEADERS


# ----------------------------------------------------
# CORS SETTINGS
# ----------------------------------------------------
ENABLE_CORS = True
CORS_OPTIONS = {
    'supports_credentials': True,
    'allow_headers': ['*'],
    'resources': ['*'],
    'origins': ['http://localhost:5500']  # Permite requisições do servidor de teste
}

# ----------------------------------------------------
# HTTP Headers Configuration
# ----------------------------------------------------
# Removido HTTP_HEADERS para tentar com OVERRIDE_HTTP_HEADERS
# HTTP_HEADERS = {
#    'Content-Security-Policy': "frame-ancestors 'self' http://localhost:5500;"
# }

# Tentativa final para controlar headers de embedding
OVERRIDE_HTTP_HEADERS = {
    'X-Frame-Options': None,  # Tenta remover o header X-Frame-Options
    'Content-Security-Policy': "frame-ancestors 'self' http://localhost:5500;"
}

"""
# ---------------------------------------------------------
# Custom JWT Claims Configuration
# ---------------------------------------------------------
# Callback function to add custom claims to JWT
def add_custom_claims(identity):
    logger.info(f"--- add_custom_claims called with identity: {identity} ---")

    # For users logging in directly via Superset standard login,
    # we do not assign a tenantUuid. It should come from an external source if needed.
    user = current_app.appbuilder.sm.get_user_by_id(identity)
    username = user.username if user else f"ID: {identity}"

    # For users logging in directly via Superset standard login,
    # we do not assign a tenantUuid. It should come from an external source if needed.
    user = current_app.appbuilder.sm.get_user_by_id(identity)
    username = user.username if user else f"ID: {identity}"

    logger.info(f"--- Generating claims for Superset login for user {username} ---")

    logger.info(f"--- Generating claims for Superset login for user {username} ---")

    claims = {
        'sistema': 'Dominio_sistemas',
        # tenantUuid is intentionally omitted for standard Superset logins
    }

    logger.info(f"--- Returning claims for Superset login (no tenantUuid): {claims} ---")
    return claims

ADDITIONAL_JWT_CLAIMS_CALLBACK = add_custom_claims

# Note: The function above (add_custom_claims) is assigned to the
# ADDITIONAL_JWT_CLAIMS_CALLBACK configuration variable.
# Superset's initialization code will automatically look for this variable
# and register the function with the JWTManager if found and callable.
# No manual registration in the app factory is needed.
"""
