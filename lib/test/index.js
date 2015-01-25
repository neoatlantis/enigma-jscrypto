(function(tool){
//////////////////////////////////////////////////////////////////////////////

function doTest(){
    var items = {
        'hash': tool.get('test.hash'),
    };

    var report = {}, evaluation = {}, conclusion = true;

    for(var itemName in items){
        report[itemName] = items[itemName].exec();
        evaluation[itemName] = items[itemName].eval(report[itemName]);
        if(conclusion)
            if(!evaluation[itemName]) conclusion = false;
    };

    return {
        report: report,
        evaluation: evaluation,
        conclusion: conclusion,
    };
};

tool.set('test', doTest);
tool.exp('test', doTest);

//////////////////////////////////////////////////////////////////////////////
})(tool);