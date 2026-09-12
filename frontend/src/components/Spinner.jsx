import React from 'react';

/**
 * Logix Orbital 3-Ring Spinner Component
 * Diseñado conforme a la referencia visual de loader.png:
 * Tres anillos concéntricos orbitando en direcciones opuestas en color cyan (#2cb8ff)
 * con mensaje centrado (#customMessage) y contenedor (#loader-wrapper).
 */
const Spinner = ({
    size = 'md',
    label = '',
    className = '',
    fullPage = false,
    dark = false,
    color = '#2cb8ff'
}) => {
    const isDark = dark || fullPage;
    const sizeClass = `logix-loader-${size}`;

    if (fullPage) {
        return (
            <div
                id="loader-wrapper"
                className={`loader-wrapper is-fullscreen is-dark ${className}`}
            >
                <div
                    id="loader"
                    className={`logix-loader ${sizeClass}`}
                    style={{ '--loader-color': color }}
                    role="status"
                    aria-label={label || 'Cargando...'}
                />
                {label && (
                    <span
                        id="customMessage"
                        className="loader-message mt-6 text-base sm:text-lg"
                    >
                        {label}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div
            id="loader-wrapper"
            className={`loader-wrapper ${isDark ? 'is-dark' : 'is-light'} ${className}`}
        >
            <div
                id="loader"
                className={`logix-loader ${sizeClass}`}
                style={{ '--loader-color': color }}
                role="status"
                aria-label={label || 'Cargando...'}
            />
            {label && (
                <span
                    id="customMessage"
                    className={`loader-message ${
                        size === 'xl'
                            ? 'mt-6 text-base sm:text-lg'
                            : size === 'lg'
                            ? 'mt-5 text-sm sm:text-base'
                            : size === 'md'
                            ? 'mt-3.5 text-sm'
                            : 'mt-2 text-xs'
                    }`}
                >
                    {label}
                </span>
            )}
        </div>
    );
};

export default Spinner;
