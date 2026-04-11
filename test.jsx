import React from 'react';
const fn = () => {
    return (
        <div className="max-w-[1400px] px-6">
            <div>
                <h1>A</h1>
                <p>B</p>
            </div>
            {val && <div>C</div>}
        </div>
    );
};
