from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.db import Base
from typing import Optional

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    is_approved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "is_approved": self.is_approved
        }

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    expires_at: Mapped[str] = mapped_column(String, nullable=False)
    used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)

    user = relationship("User", back_populates="reset_tokens")

# --- Modelos de Aplicación (Legacy Schema) ---

class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[str] = mapped_column(String, nullable=False)
    importReference: Mapped[str] = mapped_column(String, nullable=False, default='')
    waybill: Mapped[Optional[str]] = mapped_column(String)
    itemCode: Mapped[Optional[str]] = mapped_column(String) # Index exists in raw SQL: idx_importReference_itemCode
    itemDescription: Mapped[Optional[str]] = mapped_column(String)
    binLocation: Mapped[Optional[str]] = mapped_column(String)
    relocatedBin: Mapped[Optional[str]] = mapped_column(String)
    qtyReceived: Mapped[Optional[int]] = mapped_column(Integer)
    qtyGrn: Mapped[Optional[int]] = mapped_column(Integer)
    difference: Mapped[Optional[int]] = mapped_column(Integer)

class AppState(Base):
    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[Optional[str]] = mapped_column(String)

class CountSession(Base):
    __tablename__ = "count_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_username: Mapped[str] = mapped_column(String, nullable=False)
    start_time: Mapped[str] = mapped_column(String, nullable=False)
    end_time: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, nullable=False, default='in_progress')
    inventory_stage: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    locations = relationship("SessionLocation", back_populates="session", cascade="all, delete-orphan")
    counts = relationship("StockCount", back_populates="session", cascade="all, delete-orphan")

class SessionLocation(Base):
    __tablename__ = "session_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("count_sessions.id"), nullable=False)
    location_code: Mapped[str] = mapped_column(String, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default='open')
    closed_at: Mapped[Optional[str]] = mapped_column(String)
    # Columna detectada en DB pero no en init_db original
    count_stage: Mapped[Optional[int]] = mapped_column(Integer)

    session = relationship("CountSession", back_populates="locations")

class RecountList(Base):
    __tablename__ = "recount_list"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_code: Mapped[str] = mapped_column(String, nullable=False)
    stage_to_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String, nullable=False, default='pending')
    # Index idx_recount_item_stage exists in raw SQL

class StockCount(Base):
    __tablename__ = "stock_counts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("count_sessions.id"), nullable=False, index=True)
    timestamp: Mapped[str] = mapped_column(String, nullable=False)
    item_code: Mapped[str] = mapped_column(String, nullable=False)
    item_description: Mapped[Optional[str]] = mapped_column(String)
    counted_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    counted_location: Mapped[str] = mapped_column(String, nullable=False)
    bin_location_system: Mapped[Optional[str]] = mapped_column(String)
    username: Mapped[Optional[str]] = mapped_column(String)

    session = relationship("CountSession", back_populates="counts")

class PickingAudit(Base):
    __tablename__ = "picking_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_number: Mapped[str] = mapped_column(String, nullable=False)
    despatch_number: Mapped[str] = mapped_column(String, nullable=False)
    customer_name: Mapped[Optional[str]] = mapped_column(String)
    username: Mapped[str] = mapped_column(String, nullable=False)
    timestamp: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    # Columna detectada en DB
    packages: Mapped[Optional[int]] = mapped_column(Integer, default=0)

    items = relationship("PickingAuditItem", back_populates="audit", cascade="all, delete-orphan")

class PickingAuditItem(Base):
    __tablename__ = "picking_audit_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("picking_audits.id"), nullable=False, index=True)
    item_code: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    order_line: Mapped[Optional[str]] = mapped_column(String)
    qty_req: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_scan: Mapped[int] = mapped_column(Integer, nullable=False)
    difference: Mapped[int] = mapped_column(Integer, nullable=False)
    # Columna detectada en DB
    edited: Mapped[Optional[int]] = mapped_column(Integer, default=0)

    audit = relationship("PickingAudit", back_populates="items")
