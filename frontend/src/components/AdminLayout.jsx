import React, { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

/**
 * AdminLayout - Componente de soporte.
 * Se ha simplificado al máximo para no interferir con el Layout global.
 * Su única función es sincronizar el título de la página con la barra azul superior.
 */
const AdminLayout = ({ children, title }) => {
    const { setTitle } = useOutletContext() || {};

    useEffect(() => {
        if (setTitle && title) {
            // Actualizamos el título del encabezado global
            setTitle(title);
        }
    }, [setTitle, title]);

    return (
        <div className="admin-content-wrapper">
            {children}
        </div>
    );
};

export default AdminLayout;
