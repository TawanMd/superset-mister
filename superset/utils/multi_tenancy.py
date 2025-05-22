# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Basic regex to allow only lowercase letters, numbers, and underscores.
# Prevents SQL injection and ensures valid PostgreSQL schema names.
# Adjust this regex based on the exact allowed characters for your tenant UUIDs/schemas.
SCHEMA_NAME_REGEX = re.compile(r"^[a-z0-9_]+$")


def map_tenant_to_schema(tenant_uuid: str) -> Optional[str]:
    """
    Maps a tenant UUID to a PostgreSQL schema name with validation.

    :param tenant_uuid: The tenant UUID extracted from the JWT claim.
    :return: The validated schema name or None if mapping/validation fails.
    """
    if not tenant_uuid:
        logger.warning("Tenant UUID is empty or None.")
        return None

    # Check if the provided tenant_uuid already looks like a schema name (starts with 'ds_')
    # This handles the case where the JWT claim itself contains the full schema name.
    if tenant_uuid.startswith("ds_"):
        potential_schema_name = tenant_uuid
        logger.debug("Tenant UUID '%s' already looks like a schema name, using directly.", tenant_uuid)
    else:
        # Original mapping logic: prefix 'ds_' if it doesn't start with it.
        # Replace this with your actual mapping logic if needed (e.g., DB lookup).
        potential_schema_name = f"ds_{tenant_uuid}"
        logger.debug("Prefixed 'ds_' to tenant UUID '%s'.", tenant_uuid)


    # Validate the final potential schema name against the regex.
    if SCHEMA_NAME_REGEX.match(potential_schema_name):
        logger.debug("Validated schema name: '%s'", potential_schema_name)
        return potential_schema_name
    else:
        logger.error(
            "Invalid schema name '%s' (derived from tenant UUID '%s'). "
            "Schema names must match the pattern: %s",
            potential_schema_name,
            SCHEMA_NAME_REGEX.pattern,
        )
        return None
