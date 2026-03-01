import React from 'react';

// Use the combined panel with clean UI + advanced features
const MonaiLabelPanel = React.lazy(() => import('./panels/MonaiLabelPanel'));

const getPanelModule = ({ servicesManager, commandsManager, extensionManager }) => {
  return [
    {
      name: 'monai-label',
      iconName: 'tab-segmentation',
      iconLabel: 'MONAI',
      label: 'MONAI Label',
      component: props => (
        <React.Suspense fallback={<div className="p-4 text-white">Loading MONAI Label...</div>}>
          <MonaiLabelPanel
            servicesManager={servicesManager}
            commandsManager={commandsManager}
            extensionManager={extensionManager}
            {...props}
          />
        </React.Suspense>
      ),
    },
  ];
};

export default getPanelModule;
